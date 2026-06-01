FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libreoffice \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    fonts-liberation \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -fv

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p templates/prebuilt templates/uploads

EXPOSE 9000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-9000}
