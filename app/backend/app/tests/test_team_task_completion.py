"""Regression tests for TeamTaskService assignee-completion preservation.

Bug: editing a team task wiped every assignee's completed_at because
_set_assignees did a full delete + recreate. After a deadline passed,
any edit made completed assignees look overdue again.
"""
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio

from app.models.user import User
from app.core.security import hash_password
from app.services.team_task_service import TeamTaskService


@pytest_asyncio.fixture
async def three_users(db):
    users = []
    for i in range(3):
        u = User(
            email=f"tt{i}@test.com",
            username=f"tt{i}",
            hashed_password=hash_password("Passw0rd!"),
            full_name=f"TT User {i}",
            role="user",
            is_active=True,
        )
        db.add(u)
        users.append(u)
    await db.flush()
    return users


@pytest.mark.asyncio
async def test_edit_preserves_completion(db, three_users):
    svc = TeamTaskService(db)
    a, b, c = three_users

    task = await svc.create_task(
        {
            "title": "Preserve me",
            "description": None,
            "deadline": date.today() + timedelta(days=1),
            "reminder_days_before": 3,
            "assignee_ids": [a.id, b.id, c.id],
        },
        created_by=a.id,
    )

    # a and b mark themselves done
    await svc.toggle_complete(task.id, a.id)
    await svc.toggle_complete(task.id, b.id)

    reloaded = await svc.get_task(task.id)
    completed = {x.user_id: x.completed_at for x in reloaded.assignees}
    assert completed[a.id] is not None
    assert completed[b.id] is not None
    assert completed[c.id] is None

    # Edit the task (e.g. extend deadline) sending the SAME assignee list
    await svc.update_task(
        task.id,
        {
            "deadline": date.today() + timedelta(days=7),
            "assignee_ids": [a.id, b.id, c.id],
        },
    )

    after = await svc.get_task(task.id)
    after_completed = {x.user_id: x.completed_at for x in after.assignees}
    # completed_at must survive the edit
    assert after_completed[a.id] == completed[a.id], "a's completion was wiped"
    assert after_completed[b.id] == completed[b.id], "b's completion was wiped"
    assert after_completed[c.id] is None


@pytest.mark.asyncio
async def test_edit_add_and_remove_assignee(db, three_users):
    svc = TeamTaskService(db)
    a, b, c = three_users

    task = await svc.create_task(
        {
            "title": "Add remove",
            "description": None,
            "deadline": date.today(),
            "reminder_days_before": 3,
            "assignee_ids": [a.id, b.id],
        },
        created_by=a.id,
    )
    await svc.toggle_complete(task.id, a.id)

    # Remove b, add c; a stays and keeps completion
    await svc.update_task(task.id, {"assignee_ids": [a.id, c.id]})

    after = await svc.get_task(task.id)
    ids = {x.user_id for x in after.assignees}
    assert ids == {a.id, c.id}, "assignee set not updated correctly"

    by_id = {x.user_id: x for x in after.assignees}
    assert by_id[a.id].completed_at is not None, "a's completion lost on edit"
    assert by_id[c.id].completed_at is None, "new assignee should start incomplete"
