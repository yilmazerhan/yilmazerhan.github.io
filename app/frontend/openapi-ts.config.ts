import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  client: '@hey-api/client-axios',
  input: process.env.OPENAPI_URL || 'https://localhost/api/openapi.json',
  output: {
    path: 'src/api/generated',
    format: 'prettier',
    lint: 'eslint',
  },
  types: {
    enums: 'javascript',
  },
  services: {
    asClass: false,
  },
})
