"""Boundary validation for the published browser IR projection (no controller state)."""
from typing import Annotated, Literal
from pydantic import Field
from workflow_use.hybrid.evidence import Contract


class Selector(Contract):
    selector: str = Field(min_length=1, max_length=1000)


class Semantic(Contract):
    role: Literal['link', 'button', 'textbox', 'combobox']
    name: str = Field(min_length=1, max_length=300)
    fallbackName: str | None = Field(default=None, min_length=4, max_length=300)
    occurrence: int | None = Field(default=None, ge=0, le=99)


class Navigate(Contract):
    type: Literal['navigate']
    url: str = Field(min_length=1, max_length=4000)
    captureNetworkEvidence: bool = False
    reuseOpenTab: bool = False


class OpenTab(Contract):
    type: Literal['tab_open']
    url: str = Field(min_length=1, max_length=4000)
    background: bool = False


class Tab(Contract):
    type: Literal['tab_select', 'tab_close']
    tabId: int = Field(ge=0)


class Observe(Contract):
    type: Literal['observe', 'page', 'tabs']


class Read(Contract):
    type: Literal['read']
    selector: str = Field(min_length=1, max_length=1000)
    maxItems: int = Field(default=100, ge=1, le=300)


class Click(Contract):
    type: Literal['click']
    target: Selector | Semantic
    dispatch: Literal['dom'] | None = None


class Hover(Contract):
    type: Literal['hover']
    target: Selector | Semantic


class Fill(Contract):
    type: Literal['fill']
    target: Selector | Semantic
    value: str = Field(max_length=10000)


class Press(Contract):
    type: Literal['press']
    target: Selector | Semantic | None = None
    key: Literal['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight',
                 'PageDown', 'PageUp', 'Home', 'End']


class Select(Contract):
    type: Literal['select']
    target: Selector | Semantic
    values: list[Annotated[str, Field(max_length=10000)]] = Field(min_length=1, max_length=100)


class Upload(Contract):
    type: Literal['upload']
    target: Selector | Semantic
    files: list[Annotated[str, Field(min_length=1, max_length=32767)]] = Field(min_length=1, max_length=20)
    mode: Literal['input', 'drop'] = 'input'


class Download(Contract):
    type: Literal['download']
    target: Selector | Semantic | None = None
    out: str = Field(min_length=1, max_length=32767)
    overwrite: bool = False


LegacyCommand = Annotated[Navigate | OpenTab | Tab | Observe | Read | Click | Hover | Fill | Press | Select
                          | Upload | Download, Field(discriminator='type')]
