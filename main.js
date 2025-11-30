import { Command } from 'commander';
import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // для генерації унікальних ID

const program = new Command();
program
  .requiredOption('-h, --host <address>', 'Server host address')
  .requiredOption('-p, --port <number>', 'Server port number', parseInt)
  .requiredOption('-c, --cache <directory>', 'Path to the caching directory')
  .action(startServer);

program.parse(process.argv);

let INVENTORY = [];
let CACHE_DIR = '';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CACHE_DIR);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${uuidv4()}${extension}`);
  }
});
const upload = multer({ storage: storage });

function startServer(options) {
  const { host, port, cache } = options;
  CACHE_DIR = path.resolve(cache);
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`✅ Директорія кешу створена: ${CACHE_DIR}`);
  } else {
    console.log(`✅ Директорія кешу вже існує: ${CACHE_DIR}`);
  }

  const app = express();

  app.use(bodyParser.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!allowedMethods.includes(req.method)) {
      res.status(405).set('Allow', allowedMethods.join(', ')).send('Method Not Allowed');
    } else {
      next();
    }
  });

  app.get('/RegisterForm.html', (req, res) => {
    res.status(200).send("<html><body><h2>Registration Form (HTML)</h2><p>Use POST /register</p></body></html>");
  });

  app.get('/SearchForm.html', (req, res) => {
    res.status(200).send("<html><body><h2>Search Form (HTML)</h2><p>Use POST /search</p></body></html>");
  });
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
      photo_link: newItem.photo_path ? `/inventory/${newItem.id}/photo` : null
    });
  });

  app.get('/inventory', (req, res) => {
    const list = INVENTORY.map(item => ({
      ...item,
      photo_link: item.photo_path ? `/inventory/${item.id}/photo` : null
    }));
    res.status(200).json(list);
  });

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

  app.delete('/inventory/:id', (req, res) => {
    const initialLength = INVENTORY.length;
    INVENTORY = INVENTORY.filter(i => i.id !== req.params.id);

    if (INVENTORY.length === initialLength) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.status(200).json({ message: 'Item deleted successfully' });
  });

  app.get('/inventory/:id/photo', (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item || !item.photo_path) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const filePath = path.join(CACHE_DIR, item.photo_path);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Photo file is missing from cache' });
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error serving file');
      }
    });
  });

  app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = INVENTORY.find(i => i.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    item.photo_path = req.file ? path.basename(req.file.path) : null;

    res.status(200).json({ message: 'Photo updated successfully', photo_link: `/inventory/${item.id}/photo` });
  });


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
    // Якщо прапорець has_photo встановлено і фото існує, додаємо посилання
    if (has_photo === 'on' && item.photo_path) {
        response.photo_link = `/inventory/${item.id}/photo`;
    }

    res.status(200).json(response);
  });
  app.listen(port, host, () => {
    console.log(`
Сервер запущено! (Express)
Адреса: http://${host}:${port}/
Кеш-директорія: ${CACHE_DIR}
`);
  }).on('error', (e) => {
    console.error(`Помилка сервера: ${e.message}`);
    process.exit(1);
  });
}