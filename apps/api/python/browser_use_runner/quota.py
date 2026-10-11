"""Compatible import boundary; the installed shared wheel owns the adapter."""
# WHY：双方共用固定制品；产品策略/冷却仍由access_policy拥有，不从盾借数据。
from bat_request_budget import check

__all__ = ['check']
