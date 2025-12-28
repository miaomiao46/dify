import json
from typing import Literal

from flask import request
from flask_restx import Resource, marshal_with
from werkzeug.exceptions import Forbidden, NotFound

import services
from configs import dify_config
from constants import DOCUMENT_EXTENSIONS
from controllers.common.errors import (
    BlockedFileExtensionError,
    FilenameNotExistsError,
    FileTooLargeError,
    NoFileUploadedError,
    TooManyFilesError,
    UnsupportedFileTypeError,
)
from controllers.console.wraps import (
    account_initialization_required,
    cloud_edition_billing_resource_check,
    setup_required,
)
from extensions.ext_database import db
from fields.file_fields import file_fields, upload_config_fields
from libs.login import current_account_with_tenant, login_required
from services.file_service import FileService

from . import console_ns

PREVIEW_WORDS_LIMIT = 3000


@console_ns.route("/files/upload")
class FileApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    @marshal_with(upload_config_fields)
    def get(self):
        return {
            "file_size_limit": dify_config.UPLOAD_FILE_SIZE_LIMIT,
            "batch_count_limit": dify_config.UPLOAD_FILE_BATCH_LIMIT,
            "file_upload_limit": dify_config.BATCH_UPLOAD_LIMIT,
            "image_file_size_limit": dify_config.UPLOAD_IMAGE_FILE_SIZE_LIMIT,
            "video_file_size_limit": dify_config.UPLOAD_VIDEO_FILE_SIZE_LIMIT,
            "audio_file_size_limit": dify_config.UPLOAD_AUDIO_FILE_SIZE_LIMIT,
            "workflow_file_upload_limit": dify_config.WORKFLOW_FILE_UPLOAD_LIMIT,
            "image_file_batch_limit": dify_config.IMAGE_FILE_BATCH_LIMIT,
            "single_chunk_attachment_limit": dify_config.SINGLE_CHUNK_ATTACHMENT_LIMIT,
            "attachment_image_file_size_limit": dify_config.ATTACHMENT_IMAGE_FILE_SIZE_LIMIT,
        }, 200

    @setup_required
    @login_required
    @account_initialization_required
    @marshal_with(file_fields)
    @cloud_edition_billing_resource_check("documents")
    def post(self):
        current_user, _ = current_account_with_tenant()
        source_str = request.form.get("source")
        source: Literal["datasets"] | None = "datasets" if source_str == "datasets" else None
        file_metadata = request.form.get("file_metadata")

        if "file" not in request.files:
            raise NoFileUploadedError()

        if len(request.files) > 1:
            raise TooManyFilesError()
        file = request.files["file"]

        if not file.filename:
            raise FilenameNotExistsError
        if source == "datasets" and not current_user.is_dataset_editor:
            raise Forbidden()

        if source not in ("datasets", None):
            source = None

        if file_metadata is not None:
            file_metadata = json.loads(file_metadata)
            if not isinstance(file_metadata, dict):
                file_metadata = None

        try:
            upload_file = FileService(db.engine).upload_file(
                filename=file.filename,
                content=file.read(),
                mimetype=file.mimetype,
                user=current_user,
                source=source,
                file_metadata=file_metadata,
            )
        except services.errors.file.FileTooLargeError as file_too_large_error:
            raise FileTooLargeError(file_too_large_error.description)
        except services.errors.file.UnsupportedFileTypeError:
            raise UnsupportedFileTypeError()
        except services.errors.file.BlockedFileExtensionError as blocked_extension_error:
            raise BlockedFileExtensionError(blocked_extension_error.description)

        return upload_file, 201


@console_ns.route("/files/<uuid:file_id>/preview")
class FilePreviewApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    def get(self, file_id):
        file_id = str(file_id)
        text = FileService(db.engine).get_file_preview(file_id)
        return {"content": text}


@console_ns.route("/files/support-type")
class FileSupportTypeApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    def get(self):
        return {"allowed_extensions": list(DOCUMENT_EXTENSIONS)}


@console_ns.route("/files/unused")
class UnusedFilesApi(Resource):
    @setup_required
    @login_required
    @account_initialization_required
    @marshal_with(file_fields)
    def get(self):
        """获取当前登录用户创建的未使用文件列表"""
        current_user, tenant_id = current_account_with_tenant()

        unused_files = FileService(db.engine).get_unused_files_by_tenant_and_user(tenant_id, current_user.id)

        return unused_files, 200


@console_ns.route("/files/<uuid:file_id>")
class FileDeleteApi(Resource):
    """删除指定的文件"""

    @setup_required
    @login_required
    @account_initialization_required
    def delete(self, file_id):
        """删除指定ID的文件

        Args:
            file_id: 要删除的文件ID
        """
        file_id_str = str(file_id)

        try:
            # 调用文件服务删除文件
            FileService(db.engine).delete_file(file_id_str)
            return {"result": "success"}, 200
        except NotFound:
            # 文件未找到
            return {"error": "文件未找到"}, 404
        except ValueError as e:
            # 文件正在使用中，不能删除
            return {"error": str(e)}, 403
        except Exception as e:
            # 其他未预期的错误
            return {"error": f"删除文件时发生错误: {str(e)}"}, 500
