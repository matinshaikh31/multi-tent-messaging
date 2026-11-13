import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core';

// The tenants table represents each business customer using our messaging API.
// In production, tenants would be provisioned with API keys; here we use
// the x-tenant-id header as a simplified identifier per assignment spec.
export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 255 }).primaryKey(),       // e.g. "tenant-a"
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

