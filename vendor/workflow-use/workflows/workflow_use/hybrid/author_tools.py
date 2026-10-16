"""Native Tools own done; the host assembles business output after Agent ends."""
from browser_use import Tools


class AuthorTools(Tools):
    def __init__(self, *, exclude_actions=None, display_files_in_done_text=True):
        self._bat_field_read_records = None
        self._bat_method_collector = None
        self._bat_method_requirement = None
        # WHY：业务输出属于宿主读取/装配合同；原生done不承担编译、readRefs或模型抄值。
        super().__init__(output_model=None, exclude_actions=exclude_actions,
                         display_files_in_done_text=display_files_in_done_text)
