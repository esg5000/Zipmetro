const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const DATA_FILE = path.join(__dirname, 'products.json');

app.use(cors());
app.use(bodyParser.json());

// Serve static front-end (index.html and assets)
app.use(express.static(path.join(__dirname)));

function readData(){
  try{
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    console.error('Failed reading products.json', e);
    return [];
  }
}

function writeData(data){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  }catch(e){
    console.error('Failed writing products.json', e);
    return false;
  }
}

// REST API
app.get('/api/products', (req, res) => {
  const data = readData();
  res.json(data);
});

app.post('/api/products', (req, res) => {
  const body = req.body || {};
  if(!body.name || !body.category) return res.status(400).json({ error: 'name and category required' });
  const data = readData();
  const maxId = data.reduce((m, p) => Math.max(m, p.id || 0), 0);
  const id = maxId + 1;
  const product = {
    id,
    name: String(body.name),
    category: String(body.category),
    desc: body.desc ? String(body.desc) : '',
    price: Number(body.price) || 0,
    thc: Number(body.thc) || 0,
    image: body.image ? String(body.image) : ''
  };
  data.push(product);
  writeData(data);
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};
  const data = readData();
  const idx = data.findIndex(p => p.id === id);
  if(idx === -1) return res.status(404).json({ error: 'not found' });
  const p = data[idx];
  p.name = body.name !== undefined ? String(body.name) : p.name;
  p.category = body.category !== undefined ? String(body.category) : p.category;
  p.desc = body.desc !== undefined ? String(body.desc) : p.desc;
  p.price = body.price !== undefined ? Number(body.price) : p.price;
  p.thc = body.thc !== undefined ? Number(body.thc) : p.thc;
  p.image = body.image !== undefined ? String(body.image) : p.image;
  data[idx] = p;
  writeData(data);
  res.json(p);
});

app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  let data = readData();
  const before = data.length;
  data = data.filter(p => p.id !== id);
  if(data.length === before) return res.status(404).json({ error: 'not found' });
  writeData(data);
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, ()=>{
  console.log(`ZipMetro demo server running on http://localhost:${port}`);
});
