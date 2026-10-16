const categoryRepository = require('../repositories/categoryRepository');

async function ensureCategory(connection, categoryName) {
  const normalizedName = String(categoryName).trim();
  const category = await categoryRepository.findCategoryByName(connection, normalizedName);
  if (category) {
    return category.id;
  }

  return categoryRepository.createCategory(connection, normalizedName);
}

async function listCategories() {
  return categoryRepository.listCategories();
}

module.exports = { ensureCategory, listCategories };
