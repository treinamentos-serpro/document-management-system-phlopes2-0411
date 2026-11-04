const fs = require('node:fs/promises');
const path = require('node:path');

const storageDirectory = path.resolve(__dirname, '../../storage');

async function ensureStorageDirectory() {
  await fs.mkdir(storageDirectory, { recursive: true });
}

function getFilePath(storageName) {
  const isGeneratedStorageName =
    typeof storageName === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.bin$/i.test(
      storageName,
    );

  if (!isGeneratedStorageName) {
    throw new Error('Nome de armazenamento inválido.');
  }

  return path.join(storageDirectory, storageName);
}

async function exists(storageName) {
  try {
    await fs.access(getFilePath(storageName));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function remove(storageName) {
  try {
    await fs.unlink(getFilePath(storageName));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = {
  storageDirectory,
  ensureStorageDirectory,
  getFilePath,
  exists,
  remove,
};