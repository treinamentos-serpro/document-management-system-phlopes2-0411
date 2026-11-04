const documents = new Map();

function save(document) {
  documents.set(document.id, { ...document });
  return findById(document.id);
}

function findById(id) {
  const document = documents.get(id);
  return document ? { ...document } : null;
}

function findAllByOwner(owner) {
  return Array.from(documents.values())
    .filter((document) => document.owner === owner)
    .map((document) => ({ ...document }));
}

function deleteById(id) {
  return documents.delete(id);
}

module.exports = {
  save,
  findById,
  findAllByOwner,
  deleteById,
};