/* SPDX-License-Identifier: GPL-2.0-or-later
 * Included in the pinned HAProxy mux_h2.c after its native structs.
 * WHY：只导出原解码器已经校验的元数据；不复制HTTP2/HPACK或检测算法。
 */
#include <haproxy/sample.h>

static const struct mux_ops h2_ops;

static void bat_h2_order(struct h2c *h2c, struct http_hdr *list)
{
	int i, used = 0;
	struct ist name;
	char code;

	h2c->bat_order[0] = 0;
	h2c->bat_headers = 1;
	for (i = 0; list[i].n.len; i++) {
		name = list[i].n;
		if (!isttest(name))
			name = h2_phdr_to_ist(name.len);
		code = isteq(name, ist(":method")) ? 'm' :
		       isteq(name, ist(":authority")) ? 'a' :
		       isteq(name, ist(":scheme")) ? 's' :
		       isteq(name, ist(":path")) ? 'p' : 0;
		if (!code)
			continue;
		if (used >= 7) { h2c->bat_order[0] = 0; return; }
		if (used) h2c->bat_order[used++] = ',';
		h2c->bat_order[used++] = code;
	}
	h2c->bat_order[used] = 0;
}

static int smp_fetch_bat_h2(const struct arg *args, struct sample *smp,
                          const char *kw, void *private)
{
	struct connection *conn = smp->sess ? objt_conn(smp->sess->origin) : NULL;
	struct h2c *h2c;
	struct h2s *h2s;
	char *value;

	if (!conn || conn->mux != &h2_ops || !conn->ctx) return 0;
	h2c = conn->ctx;
	if (!strcmp(kw, "fc.bat_h2_window")) {
		smp->data.type = SMP_T_SINT;
		smp->data.u.sint = h2c->bat_window;
		smp->flags = SMP_F_VOL_TXN;
		return 1;
	}
	if (!strcmp(kw, "fc.bat_h2_settings")) {
		if (!h2c->bat_seen) return 0;
		value = h2c->bat_seen < 0 ? "capacity" : h2c->bat_settings;
	} else {
		if (!smp->strm || !smp->strm->scf) return 0;
		h2s = __sc_mux_strm(smp->strm->scf);
		if (!h2s || h2s->h2c != h2c) return 0;
		value = h2s->bat_order;
	}
	smp->data.type = SMP_T_STR;
	smp->data.u.str.area = value;
	smp->data.u.str.data = strlen(value);
	smp->data.u.str.size = 0;
	smp->flags = SMP_F_CONST | SMP_F_VOL_TXN;
	return 1;
}

static struct sample_fetch_kw_list bat_h2_fetches = {ILH, {
	{ "fc.bat_h2_settings", smp_fetch_bat_h2, 0, NULL, SMP_T_STR, SMP_USE_HRQHP },
	{ "fc.bat_h2_pseudo", smp_fetch_bat_h2, 0, NULL, SMP_T_STR, SMP_USE_HRQHP },
	{ "fc.bat_h2_window", smp_fetch_bat_h2, 0, NULL, SMP_T_SINT, SMP_USE_HRQHP },
	{ /* END */ },
}};
INITCALL1(STG_REGISTER, sample_register_fetches, &bat_h2_fetches);
