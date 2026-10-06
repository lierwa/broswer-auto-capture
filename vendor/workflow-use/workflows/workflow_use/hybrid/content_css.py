"""Adapt CSSOM values through a maintained CSS parser, without a second downloader."""
from tinycss2 import parse_component_value_list


def background_urls(backgrounds):
    output = []
    for background in backgrounds:
        pending = list(parse_component_value_list(background['image'], skip_comments=True))
        while pending:
            token = pending.pop()
            if token.type == 'error':
                raise ValueError('content_css_resource_unproven')
            if token.type == 'url':
                output.append(token.value)
            elif token.type == 'function':
                if token.lower_name in {'image-set', '-webkit-image-set', 'paint', 'element', 'image'}:
                    # WHY：无法证明浏览器实际选择的变体或绘制内容时，不能把可见背景漏掉后报完整。
                    raise ValueError('content_css_resource_unproven')
                if token.lower_name == 'url':
                    values = [value for value in token.arguments if value.type != 'whitespace']
                    if len(values) != 1 or values[0].type != 'string':
                        raise ValueError('content_css_resource_unproven')
                    output.append(values[0].value)
                else:
                    pending.extend(token.arguments)
    return list(dict.fromkeys(output))
