"""Single budget adapter; callers own policy, scope and database selection."""
from .quota import check

__version__ = '1.0.0'
__all__ = ['check']
