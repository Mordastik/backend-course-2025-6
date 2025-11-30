
import { Command } from 'commander';
import http from 'http';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('backend-app')
  .description('Web server with command-line arguments and caching')
  .version('1.0.0')
  // Обов'язкові параметри
  .requiredOption('-H, --host <address>', 'Server host address')
  .requiredOption('-P, --port <number>', 'Server port number', parseInt)
  .requiredOption('-C, --cache <directory>', 'Path to the caching directory')
  .action((options) => {
    // Вся логіка сервера буде тут, коли параметри успішно розпарсені
    startServer(options);
  });

program.parse(process.argv);

function createCacheDirectory(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true });
      console.log(`Директорія кешу створена: ${cachePath}`);
    } else {
      console.log(`Директорія кешу вже існує: ${cachePath}`);
    }
  } catch (error) {
    console.error(`Помилка створення директорії кешу ${cachePath}:`, error.message);
    process.exit(1);
  }
}

function startServer(options) {
  const { host, port, cache } = options;
  const cachePath = path.resolve(cache); // Перетворюємо шлях на абсолютний

  createCacheDirectory(cachePath);

  // Створення HTTP-сервера
  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(`Hello from the backend server!
Host: ${host}
Port: ${port}
Cache Directory: ${cachePath}`);
  });

  // Запуск сервера
  server.listen(port, host, () => {
    console.log(`
Сервер запущено!
Адреса: http://${host}:${port}/
Kеш-директорія: ${cachePath}
`);
  });

  server.on('error', (e) => {
    console.error(`Помилка сервера: ${e.message}`);
    if (e.code === 'EADDRINUSE') {
        console.error(`Порт ${port} вже зайнятий. Будь ласка, оберіть інший порт.`);
    }
    process.exit(1);
  });
}