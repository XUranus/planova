import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    style: Mapped[str] = mapped_column(String(50), default="modern_luxury")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    files: Mapped[list["UploadedFile"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    tasks: Mapped[list["GenerationTask"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    scenes: Mapped[list["Scene"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
