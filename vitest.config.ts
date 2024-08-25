import path from "node:path"

export default {
  test: {
    environment: "node",
    coverage: {
      provider: "istanbul",
      reporter: ["lcov"],
      include: ["src"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}
