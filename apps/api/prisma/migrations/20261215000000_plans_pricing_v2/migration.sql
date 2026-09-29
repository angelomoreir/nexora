-- Plans pricing v2: per-organization pricing repositioning
-- free 0€ | basic 29€/290€ | professional 69€/690€ | business 149€/1490€ | enterprise desde 399€ (personalizado)

UPDATE "Plan" SET "priceMonthly" = 0, "priceAnnual" = 0,
  "limitsJson" = '{"maxUsers":5,"maxStorageBytes":2147483648,"maxDocuments":100,"maxOrganizations":1,"maxWorkflows":3,"aiRequestsPerMonth":50}'
WHERE "code" = 'free';

UPDATE "Plan" SET "priceMonthly" = 2900, "priceAnnual" = 29000,
  "limitsJson" = '{"maxUsers":15,"maxStorageBytes":21474836480,"maxDocuments":1000,"maxOrganizations":1,"maxWorkflows":15,"aiRequestsPerMonth":250}'
WHERE "code" = 'basic';

UPDATE "Plan" SET "priceMonthly" = 6900, "priceAnnual" = 69000,
  "limitsJson" = '{"maxUsers":50,"maxStorageBytes":107374182400,"maxDocuments":10000,"maxOrganizations":3,"maxWorkflows":100,"aiRequestsPerMonth":1000}'
WHERE "code" = 'professional';

UPDATE "Plan" SET "priceMonthly" = 14900, "priceAnnual" = 149000,
  "limitsJson" = '{"maxUsers":200,"maxStorageBytes":536870912000,"maxDocuments":100000,"maxOrganizations":10,"maxWorkflows":-1,"aiRequestsPerMonth":5000}'
WHERE "code" = 'business';

UPDATE "Plan" SET "priceMonthly" = 39900, "priceAnnual" = 0,
  "limitsJson" = '{"maxUsers":-1,"maxStorageBytes":-1,"maxDocuments":-1,"maxOrganizations":-1,"maxWorkflows":-1,"aiRequestsPerMonth":-1}'
WHERE "code" = 'enterprise';
