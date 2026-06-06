from __future__ import annotations

import calendar
from datetime import date, datetime, time, timedelta
from typing import List, Tuple

from sqlalchemy import delete, desc, func, select
from sqlalchemy.orm import Session

from app.models.leaderboard_snapshot import LeaderboardSnapshot
from app.models.user import User
from app.models.workout_session import WorkoutSession


def get_period_bounds(period_type: str, anchor_date: date) -> Tuple[date, date]:
    if period_type == "weekly":
        period_start = anchor_date - timedelta(days=anchor_date.weekday())
        return period_start, period_start + timedelta(days=6)

    if period_type == "monthly":
        last_day = calendar.monthrange(anchor_date.year, anchor_date.month)[1]
        return anchor_date.replace(day=1), anchor_date.replace(day=last_day)

    raise ValueError("Unsupported period type")


def _metric_expression(metric_type: str):
    if metric_type == "duration_minutes":
        return func.sum(WorkoutSession.duration_minutes)
    if metric_type == "calories_burned":
        return func.sum(WorkoutSession.calories_burned)
    if metric_type == "sessions_count":
        return func.count(WorkoutSession.id)
    raise ValueError("Unsupported metric type")


def refresh_leaderboard(
    db: Session, period_type: str, metric_type: str, anchor_date: date
) -> List[LeaderboardSnapshot]:
    period_start, period_end = get_period_bounds(period_type, anchor_date)
    started_at_lower = datetime.combine(period_start, time.min)
    started_at_upper = datetime.combine(period_end + timedelta(days=1), time.min)
    metric_expression = _metric_expression(metric_type).label("value")

    rows = db.execute(
        select(
            User.id.label("id"),
            User.display_name.label("display_name"),
            User.avatar_url.label("avatar_url"),
            metric_expression,
        )
        .join(WorkoutSession, WorkoutSession.user_id == User.id)
        .where(
            WorkoutSession.status == "completed",
            WorkoutSession.started_at >= started_at_lower,
            WorkoutSession.started_at < started_at_upper,
        )
        .group_by(User.id, User.display_name, User.avatar_url)
        .order_by(desc(metric_expression), User.id.asc())
    ).all()

    db.execute(
        delete(LeaderboardSnapshot).where(
            LeaderboardSnapshot.period_type == period_type,
            LeaderboardSnapshot.metric_type == metric_type,
            LeaderboardSnapshot.period_start == period_start,
            LeaderboardSnapshot.period_end == period_end,
        )
    )

    if not rows:
        db.execute(
            delete(LeaderboardSnapshot).where(
                LeaderboardSnapshot.period_type == period_type,
                LeaderboardSnapshot.metric_type == metric_type,
                LeaderboardSnapshot.period_start <= period_start,
            )
        )
        db.commit()
        return []

    snapshots = [
        LeaderboardSnapshot(
            period_type=period_type,
            metric_type=metric_type,
            period_start=period_start,
            period_end=period_end,
            user_id=row.id,
            display_name=row.display_name or f"用户{row.id}",
            avatar_url=row.avatar_url,
            value=float(row.value),
            rank=index,
        )
        for index, row in enumerate(rows, start=1)
    ]
    db.add_all(snapshots)
    db.commit()
    return snapshots


def list_leaderboard(
    db: Session, period_type: str, metric_type: str
) -> List[LeaderboardSnapshot]:
    latest_period_start = db.execute(
        select(func.max(LeaderboardSnapshot.period_start)).where(
            LeaderboardSnapshot.period_type == period_type,
            LeaderboardSnapshot.metric_type == metric_type,
        )
    ).scalar_one()

    if latest_period_start is None:
        return []

    return list(
        db.execute(
            select(LeaderboardSnapshot)
            .where(
                LeaderboardSnapshot.period_type == period_type,
                LeaderboardSnapshot.metric_type == metric_type,
                LeaderboardSnapshot.period_start == latest_period_start,
            )
            .order_by(LeaderboardSnapshot.rank.asc())
        ).scalars()
    )
