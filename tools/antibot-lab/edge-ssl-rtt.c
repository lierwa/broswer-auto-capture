/* SPDX-License-Identifier: GPL-2.0-or-later
 * Included by the pinned HAProxy ssl_sample.c.
 * WHY：只导出OpenSSL原生计时，包含端点处理耗时；不能当纯传播RTT或bot判据。
 */
static int smp_fetch_ssl_fc_bat_rtt(const struct arg *args, struct sample *smp,
                                  const char *kw, void *private)
{
	struct connection *conn = smp->sess ? objt_conn(smp->sess->origin) : NULL;
	SSL *ssl = conn ? ssl_sock_get_ssl_object(conn) : NULL;
	uint64_t rtt = 0;
	int status = ssl ? SSL_get_handshake_rtt(ssl, &rtt) : 0;
	if (status == 1 && !rtt) status = 0;
	if (rtt > INT64_MAX) status = -1;
	smp->flags = SMP_F_VOL_SESS;
	smp->data.type = SMP_T_SINT;
	if (!strcmp(kw, "ssl_fc_bat_rtt_valid")) {
		smp->data.u.sint = status;
		return 1;
	}
	if (status != 1) return 0;
	smp->data.u.sint = rtt;
	return 1;
}
