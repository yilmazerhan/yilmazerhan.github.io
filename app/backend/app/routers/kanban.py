import re
import uuid
from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.kanban import (
    BoardCreate, BoardUpdate, BoardResponse,
    ColumnCreate, ColumnUpdate, ColumnReorderItem, ColumnResponse,
    TaskCreate, TaskUpdate, TaskMoveRequest, TaskResponse, TaskListResponse,
    TaskCommentCreate, TaskCommentResponse, TaskHistoryEntry,
    SubtaskCreate, SubtaskUpdate, SubtaskResponse,
    AttachmentResponse,
    LabelCreate, LabelUpdate, LabelResponse,
)
from pydantic import BaseModel as _BaseModel
from app.schemas.auth import MessageResponse
from app.services.kanban_service import KanbanService
from app.core.dependencies import get_current_user, require_superadmin, require_manager_or_above

router = APIRouter(prefix="/kanban", tags=["kanban"])


# ─── Boards ───────────────────────────────────────────────────────────────────

@router.get("/boards", response_model=list[BoardResponse])
async def list_boards(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
):
    svc = KanbanService(db)
    return await svc.list_boards(requester=current_user, include_archived=include_archived)


@router.post("/boards", response_model=BoardResponse, status_code=201)
async def create_board(
    body: BoardCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    board = await svc.create_board(body.name, body.description, body.color, current_user.id)
    boards = await svc.list_boards(requester=current_user)
    return next(b for b in boards if b["id"] == board.id)


@router.get("/boards/{board_id}", response_model=BoardResponse)
async def get_board(
    board_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    boards = await svc.list_boards(requester=current_user, include_archived=True)
    board = next((b for b in boards if b["id"] == board_id), None)
    if not board:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Pano bulunamadı.")
    return board


@router.patch("/boards/{board_id}", response_model=BoardResponse)
async def update_board(
    board_id: uuid.UUID,
    body: BoardUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.update_board(board_id, current_user, body.name, body.description, body.color, body.is_archived)
    boards = await svc.list_boards(requester=current_user, include_archived=True)
    return next(b for b in boards if b["id"] == board_id)


@router.delete("/boards/{board_id}", response_model=dict)
async def delete_board(
    board_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_board(board_id, current_user)
    return {"message": "Pano silindi."}


# ─── Labels ───────────────────────────────────────────────────────────────────

@router.get("/labels", response_model=list[LabelResponse])
async def list_labels(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_labels()


@router.post("/labels", response_model=LabelResponse, status_code=201)
async def create_label(
    body: LabelCreate,
    current_user: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_label(body.name, body.color, current_user.id)


@router.patch("/labels/{label_id}", response_model=LabelResponse)
async def update_label(
    label_id: uuid.UUID,
    body: LabelUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.update_label(label_id, body.name, body.color)


@router.delete("/labels/{label_id}", response_model=dict)
async def delete_label(
    label_id: uuid.UUID,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_label(label_id)
    return {"message": "Etiket silindi."}


# ─── Columns ──────────────────────────────────────────────────────────────────

@router.get("/columns", response_model=list[ColumnResponse])
async def list_columns(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    board_id: Optional[uuid.UUID] = Query(None),
):
    svc = KanbanService(db)
    return await svc.list_columns(board_id=board_id)


@router.post("/columns", response_model=ColumnResponse, status_code=201)
async def create_column(
    body: ColumnCreate,
    _: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_column(body.name, body.color, body.is_terminal, body.sort_order, body.board_id)


@router.patch("/columns/{col_id}", response_model=ColumnResponse)
async def update_column(
    col_id: uuid.UUID,
    body: ColumnUpdate,
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.update_column(col_id, body.name, body.color, body.is_terminal, body.sort_order)


@router.delete("/columns/{col_id}", response_model=MessageResponse)
async def delete_column(
    col_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_superadmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_column(col_id, current_user)
    return {"message": "Sütun silindi."}


@router.put("/columns/reorder", response_model=list[ColumnResponse])
async def reorder_columns(
    body: list[ColumnReorderItem],
    _: Annotated[User, Depends(require_manager_or_above)],
    db: Annotated[AsyncSession, Depends(get_db)],
    board_id: Optional[uuid.UUID] = Query(None),
):
    svc = KanbanService(db)
    cols = await svc.reorder_columns([{"id": str(item.id), "sort_order": item.sort_order} for item in body])
    if board_id:
        return [c for c in cols if c.board_id == board_id]
    return cols


# ─── Tasks ────────────────────────────────────────────────────────────────────

@router.get("/tasks", response_model=TaskListResponse)
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    assignee_id: Optional[uuid.UUID] = Query(None),
    team_id: Optional[uuid.UUID] = Query(None),
    column_id: Optional[uuid.UUID] = Query(None),
    board_id: Optional[uuid.UUID] = Query(None),
    priority: Optional[str] = Query(None),
    due_before: Optional[date] = Query(None),
    include_archived: bool = Query(False),
    search: Optional[str] = Query(None, max_length=200),
    label_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    svc = KanbanService(db)
    items, total = await svc.list_tasks(
        requester=current_user,
        assignee_id=assignee_id,
        team_id=team_id,
        column_id=column_id,
        board_id=board_id,
        priority=priority,
        due_before=due_before,
        include_archived=include_archived,
        search=search,
        label_id=label_id,
        skip=skip,
        limit=limit,
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    body: TaskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_task(
        title=body.title,
        column_id=body.column_id,
        created_by=current_user.id,
        description=body.description,
        assignee_id=body.assignee_id,
        priority=body.priority,
        due_date=body.due_date,
        start_date=body.start_date,
        jira_ticket=body.jira_ticket,
        label_ids=body.label_ids if body.label_ids else None,
    )


class BulkUpdateRequest(_BaseModel):
    task_ids: list[uuid.UUID]
    column_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    priority: Optional[str] = None
    is_archived: Optional[bool] = None


@router.patch("/tasks/bulk", response_model=dict)
async def bulk_update_tasks(
    body: BulkUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    count = await svc.bulk_update_tasks(
        task_ids=body.task_ids,
        column_id=body.column_id,
        assignee_id=body.assignee_id,
        priority=body.priority,
        is_archived=body.is_archived,
        requester=current_user,
    )
    return {"updated": count}


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.get_task(task_id, current_user)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    sent = body.model_fields_set
    return await svc.update_task(
        task_id=task_id,
        requester=current_user,
        title=body.title,
        description=body.description,
        assignee_id=body.assignee_id if "assignee_id" in sent else ...,
        priority=body.priority,
        due_date=body.due_date if "due_date" in sent else ...,
        start_date=body.start_date if "start_date" in sent else ...,
        jira_ticket=body.jira_ticket,
        is_archived=body.is_archived,
        label_ids=body.label_ids,
    )


@router.patch("/tasks/{task_id}/move", response_model=TaskResponse)
async def move_task(
    task_id: uuid.UUID,
    body: TaskMoveRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.move_task(task_id, body.column_id, body.sort_order, current_user)


@router.delete("/tasks/{task_id}", response_model=MessageResponse)
async def delete_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_task(task_id, current_user)
    return {"message": "Görev arşivlendi."}


# ─── History ─────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/history", response_model=list[TaskHistoryEntry])
async def get_task_history(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_history(task_id)


# ─── Comments ────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/comments", response_model=list[TaskCommentResponse])
async def list_comments(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_comments(task_id)


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentResponse, status_code=201)
async def create_comment(
    task_id: uuid.UUID,
    body: TaskCommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_comment(task_id, current_user.id, body.content)


@router.delete("/tasks/{task_id}/comments/{comment_id}", response_model=MessageResponse)
async def delete_comment(
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_comment(comment_id, current_user)
    return {"message": "Yorum silindi."}


# ─── Subtasks ────────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/subtasks", response_model=list[SubtaskResponse])
async def list_subtasks(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_subtasks(task_id)


@router.post("/tasks/{task_id}/subtasks", response_model=SubtaskResponse, status_code=201)
async def create_subtask(
    task_id: uuid.UUID,
    body: SubtaskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.create_subtask(task_id, body, requester=current_user)


@router.patch("/tasks/{task_id}/subtasks/{subtask_id}", response_model=SubtaskResponse)
async def update_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    body: SubtaskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.update_subtask(task_id, subtask_id, body, requester=current_user)


@router.delete("/tasks/{task_id}/subtasks/{subtask_id}", status_code=204)
async def delete_subtask(
    task_id: uuid.UUID,
    subtask_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    await svc.delete_subtask(task_id, subtask_id, requester=current_user)


# ─── Activity Timeline ────────────────────────────────────────────────────────

@router.get("/activity", response_model=dict)
async def list_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    svc = KanbanService(db)
    items, total = await svc.list_all_history(limit=limit, skip=skip)
    from app.models.kanban import Task as TaskModel

    result_items = []
    for h in items:
        task_result = await db.execute(
            select(TaskModel).where(TaskModel.id == h.task_id)
        )
        task = task_result.scalar_one_or_none()
        result_items.append({
            "id": str(h.id),
            "task_id": str(h.task_id),
            "task_title": task.title if task else "Deleted Task",
            "action": h.action,
            "changes": h.changes,
            "actor": {"id": str(h.actor.id), "full_name": h.actor.full_name} if h.actor else None,
            "created_at": h.created_at.isoformat(),
        })
    return {"items": result_items, "total": total, "skip": skip, "limit": limit}


# ─── Attachments ──────────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentResponse])
async def list_attachments(
    task_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    svc = KanbanService(db)
    return await svc.list_attachments(task_id)


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_UPLOAD_DIR = "/app/uploads"
_ALLOWED_EXT = re.compile(r'^\.[a-zA-Z0-9]{1,8}$')


@router.post("/tasks/{task_id}/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    import os
    import uuid as _uuid
    from fastapi import HTTPException

    # ── Verify the user can access this task ──────────────────────────────────
    svc = KanbanService(db)
    await svc.get_task(task_id, current_user)  # raises 403/404 if inaccessible

    # ── Stream-read in chunks with hard cap to avoid memory exhaustion ────────
    content = b""
    chunk_size = 65536  # 64 KB per read
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        content += chunk
        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Dosya 10 MB'dan büyük olamaz.")

    if not content:
        raise HTTPException(status_code=400, detail="Dosya boş olamaz.")

    # ── Sanitise extension (allow only safe alphanumeric extensions) ───────────
    raw_ext = os.path.splitext(file.filename or "")[-1].lower()[:10]
    ext = raw_ext if _ALLOWED_EXT.match(raw_ext) else ""
    stored_name = f"{_uuid.uuid4()}{ext}"

    # ── Write to disk ─────────────────────────────────────────────────────────
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(_UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    # ── Persist record ────────────────────────────────────────────────────────
    safe_original = os.path.basename(file.filename or stored_name)[:255]
    return await svc.create_attachment(
        task_id=task_id,
        filename=stored_name,
        original_filename=safe_original,
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        uploaded_by=current_user.id,
    )


@router.get("/tasks/{task_id}/attachments/{att_id}/download")
async def download_attachment(
    task_id: uuid.UUID,
    att_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    import os
    from urllib.parse import quote
    from fastapi import HTTPException
    from fastapi.responses import FileResponse
    from app.models.task_attachment import TaskAttachment

    # ── Verify task access ────────────────────────────────────────────────────
    svc = KanbanService(db)
    await svc.get_task(task_id, current_user)  # raises 403/404 if inaccessible

    result = await db.execute(
        select(TaskAttachment).where(
            TaskAttachment.id == att_id,
            TaskAttachment.task_id == task_id,
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Dosya eki bulunamadı.")

    # ── Path traversal guard ──────────────────────────────────────────────────
    upload_dir = os.path.realpath(_UPLOAD_DIR)
    file_path = os.path.realpath(os.path.join(upload_dir, att.filename))
    if not file_path.startswith(upload_dir + os.sep):
        raise HTTPException(status_code=400, detail="Geçersiz dosya.")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")

    # ── RFC 5987 encoded Content-Disposition (prevents header injection) ──────
    safe_name = quote(att.original_filename, safe="")
    return FileResponse(
        file_path,
        media_type=att.mime_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
    )


@router.delete("/tasks/{task_id}/attachments/{att_id}", status_code=204)
async def delete_attachment(
    task_id: uuid.UUID,
    att_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # ── Verify task access before deletion ────────────────────────────────────
    svc = KanbanService(db)
    await svc.get_task(task_id, current_user)  # raises 403/404 if inaccessible
    await svc.delete_attachment(task_id, att_id)
