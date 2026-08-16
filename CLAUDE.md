# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris clásico en JavaScript vanilla (ES6+), HTML5 Canvas y CSS. Sin dependencias, sin `package.json`, sin build ni bundler.

## Running

No hay build ni tests. Para probar cambios, abrir `index.html` directamente en el navegador o servir el directorio:

```bash
npx serve .
# o
python3 -m http.server 8000
```

## Architecture

Todo vive en 3 archivos que se referencian entre sí por IDs del DOM: `index.html` (estructura + `<canvas id="board">` 300×600 y `<canvas id="next-canvas">`), `style.css` (tema dark), `game.js` (toda la lógica, ~300 líneas, sin módulos — variables globales de estado en la parte superior del archivo).

Puntos clave del modelo en `game.js`:

- **Tablero**: matriz `ROWS × COLS` (20×10); cada celda es `0` (vacía) o índice 1–7 que indexa `COLORS`/`PIECES`.
- **Piezas**: matrices cuadradas en `PIECES`. Rotación (`rotateCW`) = transposición + reverso de filas; no usa el sistema SRS estándar.
- **Wall kicks** (`tryRotate`): tras rotar, prueba desplazamientos `[0, -1, 1, -2, 2]` en columnas hasta encontrar uno sin colisión.
- **Colisión** (`collide`): única función que valida límites del tablero y solapamiento con bloques fijados; todo movimiento (mover, rotar, drop) pasa por ella.
- **Game loop** (`loop`): `requestAnimationFrame`, acumula `dt` en `dropAccum`, baja la pieza al superar `dropInterval`.
- **Nivel/velocidad**: sube cada 10 líneas (`level = floor(lines/10)+1`); `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Puntuación**: `LINE_SCORES = [0,100,300,500,800]` × nivel al limpiar líneas; hard drop suma 2 pts/celda, soft drop 1 pt/fila.
- **Ghost piece**: `ghostY()` proyecta la caída final de la pieza actual; se dibuja con `globalAlpha = 0.2`.

Si se cambian `COLS`, `ROWS` o `BLOCK`, hay que ajustar a mano `width`/`height` de `<canvas id="board">` en `index.html` (`COLS×BLOCK` × `ROWS×BLOCK`).

## Language

README y comentarios de UI están en español; identificadores y estructura del código en inglés. Mantener esa convención al editar.
