import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './', // <-- تأكد هذا يشير لمجلد اللي فيه src
  server: {
    port: 5173,
  },
});