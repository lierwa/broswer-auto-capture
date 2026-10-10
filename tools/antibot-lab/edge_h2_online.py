"""Only adapt pinned HAProxy metadata; GNU tail owns following, Kitsune owns classification."""
import asyncio
import hashlib
import json
import re

CASE = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\Z')
SETTINGS = re.compile(r'(?:[0-9]{1,5}:[0-9]{1,10};){0,256}\Z')
QUIC_FIELDS = ('max_idle_timeout', 'max_udp_payload_size', 'initial_max_data',
               'initial_max_stream_data_bidi_local', 'initial_max_stream_data_bidi_remote',
               'initial_max_stream_data_uni', 'initial_max_streams_bidi', 'initial_max_streams_uni',
               'ack_delay_exponent', 'max_ack_delay', 'active_connection_id_limit', 'disable_active_migration')


def quic_observation(row):
    raw = row.get('quic_params')
    if row.get('alpn') != 'h3': return {}, 'http3_not_negotiated'
    if not isinstance(raw, str) or not re.fullmatch(r'[0-9]{1,19}(?:;[0-9]{1,19}){11}', raw):
        return {}, 'quic_parameters_unavailable'
    values = list(map(int, raw.split(';')))
    if (any(value >= 2**62 for value in values) or values[1] < 1200
            or any(value > 2**60 for value in values[6:8]) or values[8] > 20
            or values[9] >= 2**14 or values[10] < 2 or values[11] not in (0, 1)):
        return {}, 'quic_parameters_invalid'
    return dict(zip(QUIC_FIELDS, values)), None


def quic_shape_observation(row):
    if row.get('alpn') != 'h3': return {}, 'http3_not_negotiated'
    raw = row.get('quic_shape')
    if raw == 'capacity': return {}, 'quic_shape_capacity'
    if not isinstance(raw, str) or not re.fullmatch(r'(?:[0-9]{1,19}:[0-9]{1,5};){1,128}', raw):
        return {}, 'quic_shape_unavailable'
    pairs = [tuple(map(int, part.split(':'))) for part in raw.split(';') if part]
    ids = [key for key, _ in pairs]
    sizes = dict(pairs)
    if (len(set(ids)) != len(ids) or any(key >= 2**62 or size > 65535 for key, size in pairs)
            or 15 not in sizes or sizes[15] > 20):
        return {}, 'quic_shape_invalid'
    # RFC9000：顺序任意，31N+27为GREASE。只关联稳定ID集合/CID长度，不保存CID或扩展内容。
    # QUICHE 0x3127是按历史RTT可选发送的提示，冷/暖连接可自然出现/消失，不能当栈切换。
    stable = sorted(key for key in ids if key != 0x3127 and (key < 27 or (key - 27) % 31))
    return dict(parameters=[dict(ID=key, Length=size) for key, size in pairs],
                stableIds=stable, initialSourceCidLength=sizes[15]), None


def record_quic(base, row, case, shape=False):
    facts, reason = quic_shape_observation(row) if shape else quic_observation(row)
    fingerprint = [facts['stableIds'], facts['initialSourceCidLength']] if shape and reason is None else facts
    value = dict(at=row['at'], source_ip=row['source_ip'], site=case, session=row['session'], ua=row['ua'],
        category='quic-shape' if shape else 'quic-continuity', valid=str(reason is None).lower(),
        protocol_family=hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest() if reason is None else '',
        outcome='observed' if reason is None else 'unknown', measurement='measured' if reason is None else 'unavailable',
        reason=reason, facts=facts, entry='full-shield',
        semantics='native-parameter-id-length-order' if shape else 'native-effective-parameters')
    with (base/'logs/observations.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(value) + '\n')


def observation(row):
    if row.get('alpn') != 'h2': return {}, 'http2_not_negotiated'
    raw, order = row.get('h2_settings'), row.get('h2_pseudo')
    if raw == 'capacity': return {}, 'settings_capacity'
    if raw == 'empty': raw = ''
    if not isinstance(raw, str) or not SETTINGS.fullmatch(raw): return {}, 'settings_invalid'
    if not isinstance(order, str) or not re.fullmatch(r'[masp](?:,[masp]){3}', order):
        return {}, 'pseudo_order_invalid'
    pairs = [tuple(map(int, part.split(':'))) for part in raw.split(';') if part]
    if any(key > 65535 or value > 4294967295 for key, value in pairs): return {}, 'settings_invalid'
    window = row.get('h2_window')
    if not isinstance(window, str) or not window.isdecimal() or int(window) > 2147483647:
        return {}, 'window_update_invalid'
    return dict(Settings=[dict(ID=key, Value=value) for key, value in pairs],
                PseudoHeaderOrder=order, WindowUpdate=int(window)), None


def h3_observation(row):
    raw, order = row.get('h3_settings'), row.get('h3_pseudo')
    if raw == 'capacity': return {}, 'settings_capacity'
    if raw == 'empty': raw = ''
    if not isinstance(raw, str) or not re.fullmatch(r'(?:[0-9]{1,19}:[0-9]{1,19};){0,256}', raw):
        return {}, 'settings_invalid'
    if not isinstance(order, str) or not re.fullmatch(r'[maspr](?:,[maspr]){3,4}', order):
        return {}, 'pseudo_order_invalid'
    pairs = [tuple(map(int, part.split(':'))) for part in raw.split(';') if part]
    if any(key >= 2**62 or value >= 2**62 for key, value in pairs): return {}, 'settings_invalid'
    return dict(Settings=[dict(ID=key, Value=value) for key, value in pairs], PseudoHeaderOrder=order), None


def record_h3(base, row, case):
    facts, reason = h3_observation(row)
    family = ''
    if reason is None:
        # RFC9114 7.2.4.1的保留GREASE ID正常变化；保留原始值，只在连续性关联中排除。
        stable = [item for item in facts['Settings'] if item['ID'] < 33 or (item['ID'] - 33) % 31]
        family = hashlib.sha256(json.dumps([stable, facts['PseudoHeaderOrder']], separators=(',', ':')).encode()).hexdigest()
    value = dict(at=row['at'], source_ip=row['source_ip'], site=case, session=row['session'], ua=row['ua'],
        category='h3-continuity', valid=str(reason is None).lower(), protocol_family=family,
        outcome='observed' if reason is None else 'unknown', measurement='measured' if reason is None else 'unavailable',
        reason=reason, facts=facts, entry='full-shield')
    with (base/'logs/observations.jsonl').open('a', encoding='utf-8') as stream:
        stream.write(json.dumps(value) + '\n')


async def follow(base, record):
    log = base / 'logs/tls.jsonl'
    # WHY：启动偏移在创建子进程之前固定，避免启动期间漏行；历史告警不重放。
    offset = log.stat().st_size + 1
    process = await asyncio.create_subprocess_exec('/usr/bin/tail', '-c', '+' + str(offset),
        '--follow=name', '--retry', '--sleep-interval=.1', str(log),
        stdout=asyncio.subprocess.PIPE, limit=16384)
    try:
        while line := await process.stdout.readline():
            if not line.startswith(b'{'): continue
            row = json.loads(line)
            case = row.get('h2_case')
            if not isinstance(case, str) or not CASE.fullmatch(case): continue
            if row.get('alpn') == 'h3':
                record_h3(base, row, case)
                record_quic(base, row, case)
                record_quic(base, row, case, shape=True)
                continue
            facts, reason = observation(row)
            record(case, row['source_ip'], facts, reason, entry='full-shield')
        raise RuntimeError('edge_metadata_stream_ended')
    finally:
        if process.returncode is None:
            process.terminate()
            try: await asyncio.wait_for(process.wait(), 3)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()


async def serve_with_edge(base, record, serve):
    tasks = [asyncio.create_task(follow(base, record)), asyncio.create_task(serve)]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done: task.result()
    finally:
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
