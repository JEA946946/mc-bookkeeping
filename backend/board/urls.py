from django.urls import path

from . import views

urlpatterns = [
    path("finance", views.board_finance, name="board-finance"),
]
