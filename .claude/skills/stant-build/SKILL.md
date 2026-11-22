---
name: stant-build
description: Сборка, запуск и проверка игры STANT (Three.js + Android WebView) — сборка JS, тест в headless Chromium, выпуск APK через GitHub Actions. Использовать при любых изменениях кода игры.
---

# Сборка и проверка STANT

## 1. Сборка JS
```bash
cd game && npm ci && npm run build
```
Кладёт `game.js`, `index.html`, `style.css` в `game/dist/` и `android/app/src/main/assets/www/`.

## 2. Проверка в браузере (headless)
```bash
cd game/dist && python3 -m http.server 8765 &
```
Playwright + Chromium (уже установлены в облачном окружении), запуск с
`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Дождаться `#menu.show`, нажать `[data-act=play]`.
- Для точной физики: `game.state='test'` и `window.__test.step(кадры)` (симуляция по 1/60 с без рендера),
  затем `window.__test.render()` перед скриншотом.
- Телепорт: `game.teleport({x, z, yaw, name})`. Места: `game.world.spots`.
- События физики: обернуть `game.player.emit` (takeoff / land / crash).
- Клавиши: ArrowUp газ, S наклон назад, W вперёд, Space прыжок, 1–4 трюки.
- Проверять консоль на `pageerror`.

## 3. APK
Локально Android SDK недоступен (dl.google.com закрыт сетью). APK собирает GitHub Actions
(`.github/workflows/android.yml`) при пуше изменений в `game/`, `android/` — и сам коммитит
`apk/stant-<версия>-<дата>.apk` и `apk/stant-latest.apk` в ту же ветку.
- Перед выпуском поднять `versionCode`/`versionName` в `android/version.properties`.
- После пуша: проверить запуск через GitHub MCP (`actions_list` → `list_workflow_runs`), затем `git pull`.

## 4. Правила проекта
Всё (код, APK, идеи, скиллы) сохраняется в репозиторий — см. `CLAUDE.md`.
