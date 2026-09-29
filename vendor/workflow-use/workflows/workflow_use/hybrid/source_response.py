"""Author source transport; compiled snapshots remain separate from source receipts."""
import json


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def author_source_response(output, compilation, gaps):
    # WHY：来源事实在浏览器关闭前独立交接；原始缺口随请求保留，不混入在线编译产物。
    request = compilation.model_dump(mode='json', by_alias=True)
    return {'output': output, 'canonicalRequest': canonical_json(request),
            'sourceGaps': [item.model_dump(mode='json', by_alias=True) for item in gaps]}
