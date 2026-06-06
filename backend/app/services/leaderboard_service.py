from __future__ import annotations

import calendar
from datetime import date, datetime, time, timedelta
from typing import List, Tuple

from sqlalchemy import delete, desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.leaderboard_refresh_state import LeaderboardRefreshState
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

    refresh_state = db.execute(
        select(LeaderboardRefreshState).where(
            LeaderboardRefreshState.period_type == period_type,
            LeaderboardRefreshState.metric_type == metric_type,
            LeaderboardRefreshState.period_start == period_start,
        )
    ).scalar_one_or_none()
    if refresh_state is None:
        db.add(
            LeaderboardRefreshState(
                period_type=period_type,
                metric_type=metric_type,
                period_start=period_start,
                period_end=period_end,
            )
        )
    else:
        refresh_state.period_end = period_end
        refresh_state.refreshed_at = datetime.utcnow()

    snapshots = [
        LeaderboardSnapshot(
            period_type=period_type,
            metric_type=metric_type,
            period_start=period_start,
            period_end=period_end,
            user_id=row.id,
            display_name=row.display_name or "匿名用户",
            avatar_url=row.avatar_url,
            value=float(row.value),
            rank=index,
        )
        for index, row in enumerate(rows, start=1)
    ]
    db.add_all(snapshots)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return list_leaderboard(db, period_type, metric_type)
    return snapshots


def list_leaderboard(
    db: Session, period_type: str, metric_type: str
) -> List[LeaderboardSnapshot]:
    latest_refresh = db.execute(
        select(LeaderboardRefreshState)
        .where(
            LeaderboardRefreshState.period_type == period_type,
            LeaderboardRefreshState.metric_type == metric_type,
        )
        .order_by(LeaderboardRefreshState.period_start.desc())
        .limit(1)
    ).scalar_one_or_none()

    if latest_refresh is None:
        return []

    return list(
        db.execute(
            select(LeaderboardSnapshot)
            .where(
                LeaderboardSnapshot.period_type == period_type,
                LeaderboardSnapshot.metric_type == metric_type,
                LeaderboardSnapshot.period_start == latest_refresh.period_start,
                LeaderboardSnapshot.period_end == latest_refresh.period_end,
            )
            .order_by(LeaderboardSnapshot.rank.asc())
        ).scalars()
    )
