"""Research-only CC BY-NC-SA dataset; no training/tuning or product redistribution."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

import subprocess
base = Path(json.loads(subprocess.check_output(['node', str(Path(__file__).resolve().parents[1] / 'locations.mjs')], text=True))['directory'])
archive = base / 'upstream/web_bot_detection_dataset.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '6df794c274120d2503d496ca88dc4fce17d75b3d8d3be55b2c91011a347b239e'
output = base / 'reports/motion-phase2-labelled-input.jsonl'
counts = {}
with zipfile.ZipFile(archive) as source, output.open('w', encoding='utf-8') as dest:
    annotations = source.read('phase2/annotations/humans_and_moderate_and_advanced_bots/humans_and_moderate_and_advanced_bots').decode().splitlines()
    labels = {line.split()[0].rsplit('_', 1)[0]: line.split()[1].replace('_', '') for line in annotations if line.strip()}
    for label, name in [('human', 'humans/mouse_movements_humans.json'),
                        ('advancedbot', 'bots/mouse_movements_advanced_bots.json'),
                        ('moderatebot', 'bots/mouse_movements_moderate_bots.json')]:
        sessions = set(); skipped = 0; records = 0
        with source.open('phase2/data/mouse_movements/' + name) as file:
            for index, line in enumerate(file):
                item = json.loads(line)
                if item['session_id'] not in labels:
                    skipped += 1
                    continue
                assert labels[item['session_id']] == label
                sessions.add(item['session_id'])
                records += 1
                events = re.findall(r'\[([^\]]*)\]', item['mousemove_total_behaviour'])
                times = [int(t) for t in item['mousemove_times'].split(',') if t]
                assert len(times) == len(events), 'dataset-channel-length-mismatch'
                moves = [(re.fullmatch(r'm\((-?[\d.]+),(-?[\d.]+)\)', event), t)
                    for event, t in zip(events, times)]
                # 固定上游默认collector保留最后500点；不按测试结果挑选窗口或补造movementX。
                points = [[float(m[1]), float(m[2]), t - times[0]] for m, t in moves if m][-500:]
                row = {'record': label + '-' + str(index), 'label': label, 'points': points,
                    'duration': times[-1] - times[0], 'originalCount': len(times),
                    'userDeviceSplitKnown': False, 'missing': ['movementX', 'clicks', 'keys', 'scroll', 'touch']}
                dest.write(json.dumps(row) + '\n')
        counts[label] = {'records': records, 'uniqueSessions': len(sessions), 'unlabelledExcluded': skipped}
print(json.dumps({'input': str(output), 'counts': counts}))
