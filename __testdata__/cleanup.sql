-- This script is used by pr-check.yml to cleanup test database after each run, DbName will be set at runtime
DROP DATABASE [$(DbName)];