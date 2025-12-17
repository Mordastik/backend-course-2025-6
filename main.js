// main.js
import { Command } from 'commander';
import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// -------------------- Налаштування для ES-модуля --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------- Глобальні дані (в пам'яті) --------------------
let INVENTORY = [];

// -------------------- CLI (Commander) --------------------
const program = new Command();
program
  .requiredOption('-h, --host <address>', 'Server host address')
  .requiredOption('-p, --port <number>', 'Server port number', parseInt)
  .requiredOption('-c, --cache <directory>', 'Path to the caching directory')
  .action(startServer);

program.parse(process.argv);

// -------------------- Основна функція запуску сервера --------------------
function startServer(options) {
  const { host, port, cache } = options;

  // Шлях до директорії кешу
  const CACHE_PATH = path.resolve(cache);

  // Створення/перевірка директорії кешу
  if (!fs.existsSync(CACHE_PATH)) {
    fs.mkdirSync(CACHE_PATH, { recursive: true });
    console.log(`Директорія кешу створена: ${CACHE_PATH}`);
  } else {
    console.log(`Директорія кешу вже існує: ${CACHE_PATH}`);
  }

  // -------------------- Multer для завантаження фото --------------------
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, CACHE_PATH);
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      cb(null, `${uuidv4()}${extension}`);
    }
  });
  const upload = multer({ storage });

  // -------------------- Express app --------------------
  const app = express();

  // Для x-www-form-urlencoded (POST /search)
  app.use(bodyParser.urlencoded({ extended: true }));

  // Обмеження методів: тільки GET, POST, PUT, DELETE
  app.use((req, res, next) => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!allowedMethods.includes(req.method)) {
      return res
        .status(405)
        .set('Allow', allowedMethods.join(', '))
        .send('Method Not Allowed');
    }
    next();
  });

  // -------------------- Swagger --------------------
  const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API для інвентаризації пристроїв (лабораторна робота)',
    },
    servers: [
      {
        url: `http://${host}:${port}`,
      },
    ],
  };

  const swaggerOptions = {
    swaggerDefinition,
    apis: [path.join(__dirname, 'main.js')], // де лежать JSDoc-коментарі
  };

  const swaggerSpec = swaggerJSDoc(swaggerOptions);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // -------------------- HTML форми --------------------

  /**
   * @openapi
   * /RegisterForm.html:
   *   get:
   *     summary: Веб-форма для реєстрації пристрою
   *     responses:
   *       200:
   *         description: HTML сторінка з формою реєстрації
   */
  app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
  });

  /**
   * @openapi
   * /SearchForm.html:
   *   get:
   *     summary: Веб-форма для пошуку пристрою за ID
   *     responses:
   *       200:
   *         description: HTML сторінка з формою пошуку
   */
  app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
  });

  // -------------------- API маршрути --------------------

  /**
   * @openapi
   * /register:
   *   post:
   *     summary: Реєстрація нового пристрою
   *     description: Приймає multipart/form-data з полями inventory_name (обов'язкове), description та photo.
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               inventory_name:
   *                 type: string
   *               description:
   *                 type: string
   *               photo:
   *                 type: string
   *                 format: binary
   *             required:
   *               - inventory_name
   *     responses:
   *       201:
   *         description: Пристрій успішно зареєстровано
   *       400:
   *         description: Некоректні дані запиту
   */
  app.post('/register', upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) {
      return res.status(400).json({ error: 'inventory_name is required' });
    }

    const newItem = {
      id: uuidv4(),
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      photo_path: req.file ? path.basename(req.file.path) : null,
    };

    INVENTORY.push(newItem);

    res.status(201).json({
      message: 'Device registered successfully',
      id: newItem.id,
      photo_link: newItem.photo_path
        ? `/inventory/${newItem.id}/photo`
        : null,
    });
  });

  /**
   * @openapi
   * /inventory:
   *   get:
   *     summary: Отримання списку всіх інвентаризованих речей
   *     responses:
   *       200:
   *         description: Список інвентарних одиниць
   */
  app.get('/inventory', (req, res) => {
    const list = INVENTORY.map(item => ({
      ...item,
      photo_link: item.photo_path ? `/inventory/${item.id}/photo` : null,
    }));
    res.status(200).json(list);
  });

  /**
   * @openapi
   * /inventory/{id}:
   *   get:
   *     summary: Отримання інформації про конкретну річ
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID інвентарної речі
   *     responses:
   *       200:
   *         description: Інформація про річ
   *       404:
   *         description: Річ не знайдено
   */
  app.get('/inventory/:id', (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const response = {
      ...item,
      photo_link: item.photo_path ? `/inventory/${item.id}/photo` : null,
    };

    res.status(200).json(response);
  });

  /**
   * @openapi
   * /inventory/{id}:
   *   put:
   *     summary: Оновлення імені або опису конкретної речі
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               inventory_name:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: Річ успішно оновлено
   *       404:
   *         description: Річ не знайдено
   */
  app.put('/inventory/:id', express.json(), (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (req.body.inventory_name) {
      item.inventory_name = req.body.inventory_name;
    }
    if (req.body.description) {
      item.description = req.body.description;
    }

    res.status(200).json({ message: 'Item updated successfully', item });
  });

  /**
   * @openapi
   * /inventory/{id}:
   *   delete:
   *     summary: Видалення інвентаризованої речі
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Річ успішно видалено
   *       404:
   *         description: Річ не знайдено
   */
  app.delete('/inventory/:id', (req, res) => {
    const initialLength = INVENTORY.length;
    const itemToDelete = INVENTORY.find(i => i.id === req.params.id);

    INVENTORY = INVENTORY.filter(i => i.id !== req.params.id);

    if (INVENTORY.length === initialLength) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Видалення фото з диска (якщо було)
    if (itemToDelete && itemToDelete.photo_path) {
      try {
        fs.unlinkSync(path.join(CACHE_PATH, itemToDelete.photo_path));
      } catch (e) {
        console.error(
          `Помилка видалення файлу ${itemToDelete.photo_path}:`,
          e.message
        );
      }
    }

    res.status(200).json({ message: 'Item deleted successfully' });
  });

  /**
   * @openapi
   * /inventory/{id}/photo:
   *   get:
   *     summary: Отримання фото конкретної речі
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Повертає фото (image/jpeg)
   *       404:
   *         description: Фото або річ не знайдено
   */
  app.get('/inventory/:id/photo', (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item || !item.photo_path) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(CACHE_PATH, item.photo_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo file is missing from cache' });
    }

    res.setHeader('Content-Type', 'image/jpeg');

    res.sendFile(filePath, err => {
      if (err) {
        console.error(err);
        res.status(500).send('Error serving file');
      }
    });
  });

  /**
   * @openapi
   * /inventory/{id}/photo:
   *   put:
   *     summary: Оновлення фото зображення конкретної речі
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               photo:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Фото успішно оновлено
   *       404:
   *         description: Річ не знайдено
   */
  app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Видалити старе фото, якщо було
    if (item.photo_path) {
      try {
        fs.unlinkSync(path.join(CACHE_PATH, item.photo_path));
      } catch (e) {
        console.warn(`Не вдалося видалити старий файл: ${item.photo_path}`);
      }
    }

    item.photo_path = req.file ? path.basename(req.file.path) : null;

    res.status(200).json({
      message: 'Photo updated successfully',
      photo_link: `/inventory/${item.id}/photo`,
    });
  });

  /**
   * @openapi
   * /search:
   *   post:
   *     summary: Пошук пристрою за ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             type: object
   *             properties:
   *               id:
   *                 type: string
   *               has_photo:
   *                 type: string
   *     responses:
   *       200:
   *         description: Інформація про знайдену річ
   *       400:
   *         description: Не задано ID
   *       404:
   *         description: Річ не знайдено
   */
  app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required for search' });
    }

    const item = INVENTORY.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const response = {
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
    };

    if (has_photo === 'on' && item.photo_path) {
      response.photo_link = `/inventory/${item.id}/photo`;
    }

    res.status(200).json(response);
  });

  // -------------------- Запуск сервера --------------------
  app
    .listen(port, host, () => {
      console.log(`
Сервер запущено! (Express)
Адреса: http://${host}:${port}/
Swagger: http://${host}:${port}/docs
Кеш-директорія: ${CACHE_PATH}
`);
    })
    .on('error', e => {
      console.error(`❌ Помилка сервера: ${e.message}`);
      if (e.code === 'EADDRINUSE') {
        console.error(`Порт ${port} вже зайнятий.`);
      }
      process.exit(1);
    });
}
