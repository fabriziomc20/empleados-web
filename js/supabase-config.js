// supabase-config.js

// ⚠️ Importante: este archivo va en la carpeta pública junto a tus HTML
// Así cualquier página puede usar la misma instancia de Supabase
// Si en el futuro cambia el ANON_KEY o el URL, solo editas aquí.

const SUPABASE_URL = "https://nwpwvgzhhocdojoburvw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53cHd2Z3poaG9jZG9qb2J1cnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzEwNTUsImV4cCI6MjA3MzU0NzA1NX0.FK1zKJhT0JIL3oVBcmph08OorcQOCkZt70n6DtuC8Sk";

// Crea cliente de Supabase disponible globalmente
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
