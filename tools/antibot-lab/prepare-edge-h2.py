"""Build a separate pinned HAProxy metadata extension; never overwrite release binary."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

from lab_paths import ROOT, BASE, linux_command, linux_path, linux_architecture, artifacts
TARGET = BASE / ('runtime/haproxy-rtt-candidate' if '--candidate' in sys.argv else 'runtime/haproxy-h2')
SOURCE = TARGET / 'source'
UPSTREAM_HASH = '4c58b575503e198aa81b900880ea2f1238e65cf6121441c1b86bea3854a71212'


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def linux(file):
    return linux_path(file)


def run(*args):
    result = subprocess.run(linux_command(*args),
                            cwd=ROOT, capture_output=True)
    with (TARGET / 'build.log').open('ab') as stream:
        stream.write(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError(f'edge_h2_build_failed:{args[0]}:see {TARGET / "build.log"}')
    return result.stdout.decode().strip()


def change(text, before, after):
    if text.count(before) != 1:
        raise ValueError('edge_h2_patch_context_changed')
    return text.replace(before, after)


def patch():
    file = SOURCE / 'src/mux_h2.c'
    if digest(file) != UPSTREAM_HASH:
        raise ValueError('edge_h2_upstream_changed')
    text = file.read_text()
    text = change(text, 'struct h2c {', 'struct h2c {\n\tchar bat_settings[4353], bat_order[8];\n\tint bat_seen, bat_len, bat_headers;\n\tuint32_t bat_window;')
    text = change(text, 'struct h2s {', 'struct h2s {\n\tchar bat_order[8];')
    text = change(text, '/* descriptor for an h2 frame header */', '#include "bat_h2_samples.c"\n\n/* descriptor for an h2 frame header */')
    text = change(text, '\th2c->proxy = prx;', '\th2c->bat_seen = h2c->bat_len = h2c->bat_headers = h2c->bat_window = 0;\n\th2c->bat_settings[0] = h2c->bat_order[0] = 0;\n\th2c->proxy = prx;')
    text = change(text, '\th2s->h2c       = h2c;', '\tmemcpy(h2s->bat_order, h2c->bat_order, sizeof(h2s->bat_order));\n\th2s->h2c       = h2c;')
    text = change(text, '\t/* parse the frame */\n\tfor (offset',
        '\t/* B-A-T: bounded initial metadata, native parser and validation unchanged. */\n'
        '\tint bat_capture = !h2c->bat_seen && !(h2c->flags & H2_CF_IS_BACK);\n'
        '\tif (bat_capture) h2c->bat_seen = h2c->dfl / 6 > 256 ? -1 : 1;\n'
        '\t/* parse the frame */\n\tfor (offset')
    text = change(text, '\t\tint32_t  arg  = h2_get_n32(&h2c->dbuf, offset + 2);',
        '\t\tint32_t  arg  = h2_get_n32(&h2c->dbuf, offset + 2);\n'
        '\t\tif (bat_capture && h2c->bat_seen > 0)\n'
        '\t\t\th2c->bat_len += snprintf(h2c->bat_settings + h2c->bat_len,\n'
        '\t\t\t\tsizeof(h2c->bat_settings) - h2c->bat_len, "%u:%u;", type, (uint32_t)arg);')
    text = change(text, '\t/* This is the first HEADERS frame so it\'s a headers block */',
        '\tif (!(h2c->flags & H2_CF_IS_BACK)) bat_h2_order(h2c, list);\n'
        '\t/* This is the first HEADERS frame so it\'s a headers block */')
    text = change(text, '\t\th2c->mws += inc;',
        '\t\tif (!(h2c->flags & H2_CF_IS_BACK) && !h2c->bat_headers && !h2c->bat_window) h2c->bat_window = inc;\n'
        '\t\th2c->mws += inc;')
    file.write_text(text, newline='\n')
    shutil.copyfile(ROOT / 'edge-h2-samples.c', SOURCE / 'src/bat_h2_samples.c')


def patch_alpn():
    hashes = {
        'include/haproxy/ssl_sock-t.h': 'cc45a086df1e1d1182cc973483000c254e4706eeac05913b4882ff0b9688cf33',
        'src/ssl_sock.c': 'fb365282f406f3601dc58957d92f64465b863a29ef604bcd3d509e1ea4042273',
        'src/ssl_sample.c': '401b18f9c51a3c7183b9e1bfb13264a80b5f76df8ed8fbde764e5f9d5a7e89d2',
    }
    for name, expected in hashes.items():
        if digest(SOURCE / name) != expected: raise ValueError('edge_alpn_upstream_changed:' + name)
    file = SOURCE / 'include/haproxy/ssl_sock-t.h'
    file.write_text(change(file.read_text(), 'struct ssl_capture {',
        'struct ssl_capture {\n\tunsigned char bat_alpn[255], bat_alpn_len;'), newline='\n')
    file = SOURCE / 'src/ssl_sock.c'
    file.write_text(change(file.read_text(), '\tif (SSL_select_next_proto((unsigned char**) out, outlen,',
        '\t/* B-A-T: first client advertisement; original negotiation is unchanged. */\n'
        '\tstruct ssl_capture *capture = SSL_get_ex_data(s, ssl_capture_ptr_index);\n'
        '\tif (capture && server_len > 1 && server[0] && server[0] < server_len) {\n'
        '\t\tcapture->bat_alpn_len = server[0];\n'
        '\t\tmemcpy(capture->bat_alpn, server + 1, server[0]);\n\t}\n\n'
        '\tif (SSL_select_next_proto((unsigned char**) out, outlen,'), newline='\n')
    file = SOURCE / 'src/ssl_sample.c'
    text = change(file.read_text(), 'static int\nsmp_fetch_ssl_fc_protocol_hello_id(', '''static int
smp_fetch_ssl_fc_bat_alpn(const struct arg *args, struct sample *smp, const char *kw, void *private)
{
	SSL *ssl = ssl_sock_get_ssl_object(objt_conn(smp->sess->origin));
	struct ssl_capture *capture = ssl ? SSL_get_ex_data(ssl, ssl_capture_ptr_index) : NULL;
	if (!capture) return 0;
	smp->flags = SMP_F_CONST | SMP_F_VOL_SESS;
	smp->data.type = SMP_T_STR;
	smp->data.u.str.area = (char *)capture->bat_alpn;
	smp->data.u.str.data = capture->bat_alpn_len;
	smp->data.u.str.size = 0;
	return 1;
}

static int
smp_fetch_ssl_fc_protocol_hello_id(''')
    text = change(text, '\t{ "ssl_fc_protocol_hello_id",',
        '\t{ "ssl_fc_bat_alpn", smp_fetch_ssl_fc_bat_alpn, 0, NULL, SMP_T_STR, SMP_USE_L5CLI },\n'
        '\t{ "ssl_fc_protocol_hello_id",')
    text = change(text, 'static int\nsmp_fetch_ssl_fc_bat_alpn(',
        '#include "bat_ssl_rtt.c"\n\nstatic int\nsmp_fetch_ssl_fc_bat_alpn(')
    text = change(text, '\t{ "ssl_fc_bat_alpn",',
        '\t{ "ssl_fc_bat_rtt", smp_fetch_ssl_fc_bat_rtt, 0, NULL, SMP_T_SINT, SMP_USE_L5CLI },\n'
        '\t{ "ssl_fc_bat_rtt_valid", smp_fetch_ssl_fc_bat_rtt, 0, NULL, SMP_T_SINT, SMP_USE_L5CLI },\n'
        '\t{ "ssl_fc_bat_alpn",')
    file.write_text(text, newline='\n')
    shutil.copyfile(ROOT / 'edge-ssl-rtt.c', SOURCE / 'src/bat_ssl_rtt.c')


def patch_h3():
    file = SOURCE / 'src/h3.c'
    if digest(file) != 'fbc58c3fd36d6ecc243c7eaaabdf0dcf9edc931471a39de2ab3686af54b17173':
        raise ValueError('edge_h3_upstream_changed')
    text = file.read_text()
    text = change(text, 'struct h3c {', 'struct h3c {\n\tchar bat_settings[10241];\n\tint bat_seen, bat_len, bat_count;')
    text = change(text, 'struct h3s {', 'struct h3s {\n\tchar bat_order[10];')
    text = change(text, '/* Initialize an uni-stream', '#include "bat_h3_samples.c"\n\n/* Initialize an uni-stream')
    text = change(text, '\th3c->qcc = qcc;', '\th3c->bat_seen = h3c->bat_len = h3c->bat_count = 0;\n\th3c->bat_settings[0] = 0;\n\th3c->qcc = qcc;')
    text = change(text, '\tqcs->ctx = h3s;', '\th3s->bat_order[0] = 0;\n\tqcs->ctx = h3s;')
    text = change(text, '\t/* first treat pseudo-header to build the start line */',
        '\tbat_h3_order(h3s, list);\n\t/* first treat pseudo-header to build the start line */')
    text = change(text, '\t/* Work on a copy of <buf>. */', '\th3c->bat_seen = 1;\n\t/* Work on a copy of <buf>. */')
    # WHY：原解码器在零长度SETTINGS头后直接break，不调用payload解析器；这里只记录已校验的空帧。
    text = change(text, '\t\t\tif (!b_data(b))\n\t\t\t\tbreak;\n\t\t}\n\n\t\tflen = h3s->demux_frame_len;',
        '\t\t\tif (ftype == H3_FT_SETTINGS && !flen) h3c->bat_seen = 1;\n'
        '\t\t\tif (!b_data(b))\n\t\t\t\tbreak;\n\t\t}\n\n\t\tflen = h3s->demux_frame_len;')
    text = change(text, '\t\th3_debug_printf(stderr, "%s id: %llu value: %llu\\n",',
        '\t\tbat_h3_setting(h3c, id, value);\n\t\th3_debug_printf(stderr, "%s id: %llu value: %llu\\n",')
    file.write_text(text, newline='\n')
    shutil.copyfile(ROOT / 'edge-h3-samples.c', SOURCE / 'src/bat_h3_samples.c')


def patch_quic_shape():
    header, source = SOURCE / 'include/haproxy/quic_tp-t.h', SOURCE / 'src/quic_tp.c'
    if digest(header) != '39b231cc340ec71c3fb5d2ddee97b70923b2a64dfdcb888a801f44c75289a697':
        raise ValueError('edge_quic_header_changed')
    if digest(source) != 'd3a8c8c152ab8e318237ab6870ff400632bb76be127af9621ccf960a3c316b09':
        raise ValueError('edge_quic_decoder_changed')
    header.write_text(change(header.read_text(), 'struct quic_transport_params {',
        'struct quic_transport_params {\n\tuint64_t bat_ids[128];\n\tuint16_t bat_sizes[128];\n\tunsigned bat_count;'), newline='\n')
    text = change(source.read_text(), '\tpos = buf;\n\n\twhile (pos != end) {',
        '\tp->bat_count = 0;\n\tpos = buf;\n\n\twhile (pos != end) {')
    # WHY：只观察原解析器已验证的ID/长度，原值/顺序校验、默认值和错误路径保持原实现。
    text = change(text, '\t\terr = quic_transport_param_decode(p, server, type, &pos, len);',
        '\t\tif (p->bat_count < 128 && len <= UINT16_MAX) {\n'
        '\t\t\tp->bat_ids[p->bat_count] = type;\n'
        '\t\t\tp->bat_sizes[p->bat_count++] = len;\n'
        '\t\t} else p->bat_count = 129;\n'
        '\t\terr = quic_transport_param_decode(p, server, type, &pos, len);')
    source.write_text(text, newline='\n')


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    active = subprocess.run(linux_command('systemctl', '--user', 'is-active', '--quiet', 'bat-antibot-edge.service'), cwd=ROOT)
    if active.returncode == 0 and '--candidate' not in sys.argv:
        raise ValueError('stop_owned_edge_before_build')
    items = artifacts()
    names = ('haproxy-3.2.9-source.tar.gz', 'haproxy_3.2.9-1ubuntu2.2.debian.tar.xz',
             'libssl-dev_3.5.5-1ubuntu3.7_amd64.deb', 'liblua5.4-dev_5.4.8-1build1_amd64.deb',
             'libpcre2-dev_10.46-1build1_amd64.deb', 'libcrypt-dev_4.5.1-1_amd64.deb')
    selected = [item for item in items if item['name'] in names]
    if len(selected) != len(names): raise ValueError('edge_h2_artifacts_missing')
    for item in selected:
        archive = BASE / 'upstream' / item['name']
        if not archive.exists():
            subprocess.run(['curl.exe' if sys.platform == 'win32' else 'curl', '--fail', '--location', '--silent', '--show-error',
                            '--output', str(archive), item['url']], cwd=ROOT, check=True)
        if digest(archive) != item['sha256']: raise ValueError('edge_h2_artifact_changed')
    SOURCE.mkdir(parents=True, exist_ok=True)
    deps = TARGET / 'deps'
    deps.mkdir(exist_ok=True)
    source, include = linux(SOURCE), linux(deps / 'usr/include')
    run('tar', '-xf', linux(BASE / 'upstream' / names[0]), '--strip-components=1', '-C', source)
    run('tar', '-xf', linux(BASE / 'upstream' / names[1]), '-C', source)
    for entry in (SOURCE / 'debian/patches/series').read_text().splitlines():
        if entry.strip() and not entry.startswith('#'):
            run('patch', '--batch', '-p1', '-d', source, '-i', source + '/debian/patches/' + entry)
    for name in names[2:]: run('dpkg-deb', '-x', linux(BASE / 'upstream' / name), linux(deps))
    patch()
    patch_alpn()
    patch_h3()
    patch_quic_shape()
    run('make', '-C', source, '-j4', 'TARGET=linux-glibc', 'USE_OPENSSL=1', 'USE_QUIC=1',
        'USE_LUA=1', 'USE_SLZ=1', 'USE_PROMEX=1', 'USE_PCRE2=1', 'USE_PCRE2_JIT=1',
        'SSL_INC=' + include, 'SSL_LDFLAGS=-l:libssl.so.3 -l:libcrypto.so.3',
        'ADDINC=-I' + include + ('/aarch64-linux-gnu' if linux_architecture() == 'arm64' else '/x86_64-linux-gnu'), 'LUA_INC=' + include + '/lua5.4',
        'LUA_LIB_NAME=:liblua5.4.so.0', 'PCRE2_INC=' + include,
        'PCRE2_LDFLAGS=-l:libpcre2-8.so.0', 'LIBCRYPT_LDFLAGS=-l:libcrypt.so.1')
    binary = TARGET / 'haproxy'
    shutil.copyfile(SOURCE / 'haproxy', binary)
    run('chmod', '755', linux(binary))
    version = run(linux(binary), '-vv')
    receipt = dict(architecture=linux_architecture(), upstream='3.2.9-1ubuntu2.2', binarySha256=digest(binary),
                   adapterSha256=digest(ROOT / 'edge-h2-samples.c'),
                   h3AdapterSha256=digest(ROOT / 'edge-h3-samples.c'),
                   rttAdapterSha256=digest(ROOT / 'edge-ssl-rtt.c'),
                   recipeSha256=digest(Path(__file__)), version=version)
    (TARGET / 'candidate.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(dict(candidate=str(binary), sha256=receipt['binarySha256'], activated=False)))


if __name__ == '__main__':
    main()
