type TableName = "customers";

const tables: Record<TableName, unknown[]> = {
  customers: Array.from({ length: 1284 }, (_, index) => ({ id: index + 1 }))
};

export const db = {
  async deleteTable(table: TableName): Promise<{ deleted: true }> {
    tables[table] = [];
    return { deleted: true };
  },

  getRowCount(table: TableName): number {
    return tables[table].length;
  }
};
