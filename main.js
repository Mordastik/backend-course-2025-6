import { Command } from 'commander';
import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// --- Глобальні дані ---
// Залишаємо тільки INVENTORY, оскільки шлях до кешу буде локальною константою.
let INVENTORY = [];

const program = new Command();
program
  .requiredOption('-h, --host <address>', 'Server host address')
  .requiredOption('-p, --port <number>', 'Server port number', parseInt)
  .requiredOption('-c, --cache <directory>', 'Path to the caching directory')
  .action(startServer);

program.parse(process.argv);

// --- Основна функція сервера ---
function startServer(options) {
  const { host, port, cache } = options;

  // 1. Оголошуємо шлях кешу як локальну константу CACHE_PATH
  const CACHE_PATH = path.resolve(cache);

  // 2. Створення директорії кешу
  if (!fs.existsSync(CACHE_PATH)) {
    fs.mkdirSync(CACHE_PATH, { recursive: true });
    console.log(`Директорія кешу створена: ${CACHE_PATH}`);
  } else {
    console.log(`Директорія кешу вже існує: ${CACHE_PATH}`);
  }

  // 3. Ініціалізація Multer (повинна бути тут, після встановлення шляху)
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Використовуємо локально встановлену константу CACHE_PATH
      cb(null, CACHE_PATH);
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      cb(null, `${uuidv4()}${extension}`);
    }
  });
  const upload = multer({ storage: storage });

  const app = express();

  // Middleware для обробки URL-кодованих даних (для POST /search)
  app.use(bodyParser.urlencoded({ extended: true }));

  // Middleware для 405 Method Not Allowed
  app.use((req, res, next) => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    // Не забороняємо OPTIONS, якщо це не вимагається
    if (!allowedMethods.includes(req.method)) {
      res.status(405).set('Allow', allowedMethods.join(', ')).send('Method Not Allowed');
    } else {
      next();
    }
  });

  app.get('/RegisterForm.html', (req, res) => {
    // Встановлюємо Content-Type для HTML
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send("<html><body><h2>Registration Form (HTML)</h2><p>Use POST /register</p></body></html>");
  });

  app.get('/SearchForm.html', (req, res) => {
    // Встановлюємо Content-Type для HTML
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send("<html><body><h2>Search Form (HTML)</h2><p>Use POST /search</p></body></html>");
  });

  // --- POST /register (Реєстрація) ---
  app.post('/register', upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) {
      return res.status(400).json({ error: 'inventory_name is required' });
    }

    const newItem = {
      id: uuidv4(),
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      // Multer зберігає файл і повертає шлях, photo_path має бути basename
      photo_path: req.file ? path.basename(req.file.path) : null, 
    };

    INVENTORY.push(newItem);

    // Успішне створення повертає 201
    res.status(201).json({
      message: 'Device registered successfully',
      id: newItem.id,
      photo_link: newItem.photo_path ? `/inventory/${newItem.id}/photo` : null
    });
  });

  // --- GET /inventory (Список усіх речей) ---
  app.get('/inventory', (req, res) => {
    const list = INVENTORY.map(item => ({
      ...item,
      photo_link: item.photo_path ? `/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(list);
  });

  // --- GET /inventory/:id (Інформація про конкретну річ) ---
  app.get('/inventory/:id', (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const response = {
      ...item,
      photo_link: item.photo_path ? `/inventory/${item.id}/photo` : null
    };

    res.status(200).json(response);
  });

  // --- PUT /inventory/:id (Оновлення імені/опису) ---
  // Middleware express.json() потрібен для обробки JSON body
  app.put('/inventory/:id', express.json(), (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Оновлення полів
    if (req.body.inventory_name) {
      item.inventory_name = req.body.inventory_name;
    }
    if (req.body.description) {
      item.description = req.body.description;
    }

    res.status(200).json({ message: 'Item updated successfully', item });
  });

  // --- DELETE /inventory/:id (Видалення) ---
  app.delete('/inventory/:id', (req, res) => {
    const initialLength = INVENTORY.length;
    // Знаходимо елемент для видалення (можливо, з видаленням фото з диска)
    const itemToDelete = INVENTORY.find(i => i.id === req.params.id);

    // Видаляємо з INVENTORY
    INVENTORY = INVENTORY.filter(i => i.id !== req.params.id);

    if (INVENTORY.length === initialLength) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // (Необов'язково) Видалення фото з диска
    if (itemToDelete && itemToDelete.photo_path) {
        try {
            fs.unlinkSync(path.join(CACHE_PATH, itemToDelete.photo_path));
        } catch (e) {
            console.error(`Помилка видалення файлу ${itemToDelete.photo_path}:`, e.message);
        }
    }

    res.status(200).json({ message: 'Item deleted successfully' });
  });

  // --- GET /inventory/:id/photo (Отримання фото) ---
  app.get('/inventory/:id/photo', (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item || !item.photo_path) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(CACHE_PATH, item.photo_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo file is missing from cache' });
    }

    // Відповідь, яка містить картинку, має мати хедер Content-Type зі значенням image/jpeg
    res.setHeader('Content-Type', 'image/jpeg');

    res.sendFile(filePath, (err) => {
      if (err) {
        // Якщо помилка не 404, то це, ймовірно, 500
        console.error(err);
        res.status(500).send('Error serving file');
      }
    });
  });

  // --- PUT /inventory/:id/photo (Оновлення фото) ---
  app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    // Якщо існувало старе фото, його можна видалити
    if (item.photo_path) {
        try {
            fs.unlinkSync(path.join(CACHE_PATH, item.photo_path));
        } catch (e) {
            console.warn(`Не вдалося видалити старий файл: ${item.photo_path}`);
        }
    }

    // Оновлюємо посилання на нове фото
    item.photo_path = req.file ? path.basename(req.file.path) : null;

    res.status(200).json({ message: 'Photo updated successfully', photo_link: `/inventory/${item.id}/photo` });
  });


  // --- POST /search (Обробка запиту пошуку за ID) ---
  app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required for search' });
    }
    const item = INVENTORY.find(i => i.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    let response = {
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description
    };
    // Перевірка прапорця has_photo
    if (has_photo === 'on' && item.photo_path) {
      response.photo_link = `/inventory/${item.id}/photo`;
    }

    res.status(200).json(response);
  });

  app.listen(port, host, () => {
    console.log(`
Сервер запущено! (Express)
Адреса: http://${host}:${port}/
Кеш-директорія: ${CACHE_PATH}
`);
  }).on('error', (e) => {
    console.error(`❌ Помилка сервера: ${e.message}`);
    if (e.code === 'EADDRINUSE') {
        console.error(`Порт ${port} вже зайнятий.`);
    }
    process.exit(1);
  });
}