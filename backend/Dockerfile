FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["sh", "-c", "python manage.py migrate --settings=config.settings.local && python manage.py seed_accounts --settings=config.settings.local && gunicorn config.wsgi:application --bind 0.0.0.0:8001 --reload --workers 2 --timeout 120"]
