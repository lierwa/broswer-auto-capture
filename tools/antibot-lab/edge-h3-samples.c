/* SPDX-License-Identifier: LGPL-2.1-only
 * Included in pinned HAProxy h3.c after its original structs.
 * WHY：只导出原QUIC/QPACK解码器的元数据，不实现协议解析或评分。
 */
#include <haproxy/sample.h>
#include <haproxy/quic_conn-t.h>

static int smp_fetch_bat_quic(const struct arg *args, struct sample *smp,
                            const char *kw, void *private)
{
	struct connection *conn = smp->sess ? objt_conn(smp->sess->origin) : NULL;
	struct quic_transport_params *p;
	struct buffer *out;
	if (!conn || !conn->mux || strcmp(conn->mux->name, "QUIC") || !conn->handle.qc) return 0;
	/* WHY：tx.params是对端声明，rx.params是本服务声明；默认值由原RFC解码器拥有。 */
	p = &conn->handle.qc->tx.params;
	out = get_trash_chunk();
	if (!strcmp(kw, "fc.bat_quic_shape")) {
		unsigned i;
		if (!p->bat_count) return 0;
		chunk_reset(out);
		if (p->bat_count > 128) chunk_strcat(out, "capacity");
		else for (i = 0; i < p->bat_count; ++i)
			chunk_appendf(out, "%llu:%u;", (ull)p->bat_ids[i], (unsigned)p->bat_sizes[i]);
		smp->data.type = SMP_T_STR;
		smp->data.u.str = *out;
		smp->flags = SMP_F_VOL_SESS;
		return 1;
	}
	chunk_printf(out, "%llu;%llu;%llu;%llu;%llu;%llu;%llu;%llu;%llu;%llu;%llu;%u",
		(ull)p->max_idle_timeout, (ull)p->max_udp_payload_size, (ull)p->initial_max_data,
		(ull)p->initial_max_stream_data_bidi_local, (ull)p->initial_max_stream_data_bidi_remote,
		(ull)p->initial_max_stream_data_uni, (ull)p->initial_max_streams_bidi,
		(ull)p->initial_max_streams_uni, (ull)p->ack_delay_exponent, (ull)p->max_ack_delay,
		(ull)p->active_connection_id_limit, (unsigned)p->disable_active_migration);
	smp->data.type = SMP_T_STR;
	smp->data.u.str = *out;
	smp->flags = SMP_F_VOL_SESS;
	return 1;
}

static void bat_h3_setting(struct h3c *h3c, uint64_t id, uint64_t value)
{
	if (++h3c->bat_count > 256) { h3c->bat_seen = -1; return; }
	h3c->bat_len += snprintf(h3c->bat_settings + h3c->bat_len,
		sizeof(h3c->bat_settings) - h3c->bat_len, "%llu:%llu;",
		(unsigned long long)id, (unsigned long long)value);
}

static void bat_h3_order(struct h3s *h3s, struct http_hdr *list)
{
	int i, used = 0;
	char code;
	struct ist name;
	h3s->bat_order[0] = 0;
	for (i = 0; list[i].n.len; i++) {
		name = list[i].n;
		code = isteq(name, ist(":method")) ? 'm' :
		       isteq(name, ist(":authority")) ? 'a' :
		       isteq(name, ist(":scheme")) ? 's' :
		       isteq(name, ist(":path")) ? 'p' :
		       isteq(name, ist(":protocol")) ? 'r' : 0;
		if (!code) continue;
		if (used >= 9) { h3s->bat_order[0] = 0; return; }
		if (used) h3s->bat_order[used++] = ',';
		h3s->bat_order[used++] = code;
	}
	h3s->bat_order[used] = 0;
}

static int smp_fetch_bat_h3(const struct arg *args, struct sample *smp,
                          const char *kw, void *private)
{
	struct connection *conn = smp->sess ? objt_conn(smp->sess->origin) : NULL;
	struct qcc *qcc;
	struct qcs *qcs;
	struct h3c *h3c;
	char *value;
	if (!conn || !conn->mux || strcmp(conn->mux->name, "QUIC") || !conn->ctx) return 0;
	qcc = conn->ctx;
	if (qcc->app_ops != &h3_ops || !qcc->ctx) return 0;
	h3c = qcc->ctx;
	if (!strcmp(kw, "fc.bat_h3_settings")) {
		if (!h3c->bat_seen) return 0;
		value = h3c->bat_seen < 0 ? "capacity" : h3c->bat_settings;
	} else {
		if (!smp->strm || !smp->strm->scf) return 0;
		qcs = __sc_mux_strm(smp->strm->scf);
		if (!qcs || qcs->qcc != qcc || !qcs->ctx) return 0;
		value = ((struct h3s *)qcs->ctx)->bat_order;
	}
	smp->data.type = SMP_T_STR;
	smp->data.u.str.area = value;
	smp->data.u.str.data = strlen(value);
	smp->data.u.str.size = 0;
	smp->flags = SMP_F_CONST | SMP_F_VOL_TXN;
	return 1;
}

static struct sample_fetch_kw_list bat_h3_fetches = {ILH, {
	{ "fc.bat_quic_params", smp_fetch_bat_quic, 0, NULL, SMP_T_STR, SMP_USE_L5CLI },
	{ "fc.bat_quic_shape", smp_fetch_bat_quic, 0, NULL, SMP_T_STR, SMP_USE_L5CLI },
	{ "fc.bat_h3_settings", smp_fetch_bat_h3, 0, NULL, SMP_T_STR, SMP_USE_L5CLI },
	{ "fc.bat_h3_pseudo", smp_fetch_bat_h3, 0, NULL, SMP_T_STR, SMP_USE_L5CLI },
	{ /* END */ },
}};
INITCALL1(STG_REGISTER, sample_register_fetches, &bat_h3_fetches);
