from configs.extra.lab_config import LabConfig
from configs.extra.archive_config import ArchiveStorageConfig
from configs.extra.notion_config import NotionConfig
from configs.extra.sentry_config import SentryConfig


class ExtraServiceConfig(
    # place the configs in alphabet order
    ArchiveStorageConfig,
    NotionConfig,
    SentryConfig,
    LabConfig,
):
    pass
