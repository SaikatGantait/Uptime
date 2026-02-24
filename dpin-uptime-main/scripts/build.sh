bun run build
echo "⚙️ Generating Prisma Client..."
cd packages/db && npx prisma generate
echo "✓ Build complete!"
