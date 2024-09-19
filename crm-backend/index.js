const { createServer } = require('http');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = './crm.db'; // Используем SQLite для хранения данных
const PORT = process.env.PORT || 3000;
const URI_PREFIX = '/api/clients';

// Создаем или открываем базу данных
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Ошибка при подключении к базе данных:', err.message);
  } else {
    console.log('Подключение к базе данных SQLite установлено.');
    db.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        surname TEXT NOT NULL,
        lastName TEXT NOT NULL,
        contacts TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
  }
});

/**
 * Асинхронно считывает тело запроса и разбирает его как JSON
 */
function drainJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(JSON.parse(data));
    });
  });
}

// Получение списка клиентов
function getClientList(params = {}) {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM clients';
    if (params.search) {
      sql += ` WHERE name LIKE '%${params.search}%' OR surname LIKE '%${params.search}%'`;
    }
    db.all(sql, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Создание нового клиента
function createClient(data) {
  return new Promise((resolve, reject) => {
    const { name, surname, lastName, contacts } = data;
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;
    db.run(
      `INSERT INTO clients (name, surname, lastName, contacts, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, surname, lastName, JSON.stringify(contacts), createdAt, updatedAt],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            name,
            surname,
            lastName,
            contacts,
            createdAt,
            updatedAt,
          });
        }
      }
    );
  });
}

// Получение клиента по ID
function getClient(itemId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM clients WHERE id = ?`, [itemId], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        reject(new Error('Client Not Found'));
      } else {
        row.contacts = JSON.parse(row.contacts); // Преобразуем контакты обратно в массив
        resolve(row);
      }
    });
  });
}

// Обновление клиента
function updateClient(itemId, data) {
  return new Promise((resolve, reject) => {
    const updatedAt = new Date().toISOString();
    const { name, surname, lastName, contacts } = data;
    db.run(
      `UPDATE clients
       SET name = ?, surname = ?, lastName = ?, contacts = ?, updatedAt = ?
       WHERE id = ?`,
      [name, surname, lastName, JSON.stringify(contacts), updatedAt, itemId],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: itemId,
            name,
            surname,
            lastName,
            contacts,
            updatedAt,
          });
        }
      }
    );
  });
}

// Удаление клиента
function deleteClient(itemId) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM clients WHERE id = ?`, [itemId], function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({});
      }
    });
  });
}

// Создаем HTTP сервер
module.exports = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  if (!req.url || !req.url.startsWith(URI_PREFIX)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'Not Found' }));
    return;
  }

  const [uri, query] = req.url.substr(URI_PREFIX.length).split('?');
  const queryParams = {};
  if (query) {
    for (const piece of query.split('&')) {
      const [key, value] = piece.split('=');
      queryParams[key] = value ? decodeURIComponent(value) : '';
    }
  }

  try {
    let body;
    if (uri === '' || uri === '/') {
      if (req.method === 'GET') body = await getClientList(queryParams);
      if (req.method === 'POST') {
        const createdItem = await createClient(await drainJson(req));
        res.statusCode = 201;
        res.setHeader('Location', `${URI_PREFIX}/${createdItem.id}`);
        body = createdItem;
      }
    } else {
      const itemId = uri.substr(1);
      if (req.method === 'GET') body = await getClient(itemId);
      if (req.method === 'PATCH') body = await updateClient(itemId, await drainJson(req));
      if (req.method === 'DELETE') body = await deleteClient(itemId);
    }
    res.end(JSON.stringify(body));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ message: err.message }));
    console.error(err);
  }
}).listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
