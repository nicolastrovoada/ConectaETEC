import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadDotenv } from "dotenv"

/**
 * Carregamento de variáveis de ambiente do arquivo `.env`.
 *
 * O servidor procura o arquivo em três locais, do mais específico para o mais
 * geral, e o primeiro valor encontrado vence:
 *
 * 1. `app/server/.env` — configuração local do workspace do servidor;
 * 2. `app/.env` — configuração local do monorepo;
 * 3. `.env` na raiz do repositório.
 *
 * Variáveis já presentes em `process.env` têm precedência sobre o arquivo
 * (comportamento padrão do dotenv), o que permite sobrescrever qualquer valor
 * no shell ou na plataforma de deploy sem editar o `.env`.
 *
 * O arquivo é opcional: quando não existe, a aplicação continua com os valores
 * padrão de `config.ts`. Arquivos `.env` são ignorados pelo Git; apenas
 * `.env.example` é versionado.
 */
function candidateEnvFiles(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const cwd = process.cwd()

  // `moduleDir` é `app/server/src` em desenvolvimento (`tsx`) e
  // `app/server/dist/server/src` no build. As duas listas cobrem os dois casos;
  // entradas repetidas ou inexistentes são descartadas pelo dotenv.
  const directories = [
    path.resolve(moduleDir, ".."), // app/server
    cwd, // app/server quando executado via npm workspace
    path.resolve(moduleDir, "..", ".."), // app
    path.resolve(cwd, ".."), // app quando executado a partir de app/server
    path.resolve(moduleDir, "..", "..", ".."), // raiz do repositório
    path.resolve(cwd, "..", ".."), // raiz, quando executado a partir de app/server
  ]

  const seen = new Set<string>()
  const files: string[] = []
  for (const directory of directories) {
    const file = path.resolve(directory, ".env")
    // Windows diferencia maiúsculas/minúsculas apenas na aparência do caminho;
    // a chave normalizada evita carregar o mesmo arquivo duas vezes.
    const key = file.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    files.push(file)
  }
  return files
}

export function loadEnvironment(): void {
  // Testes definem o ambiente em `tests/setup-env.ts` e não podem herdar um
  // `.env` do desenvolvedor (por exemplo, `NODE_ENV=production` ou
  // `BOOTSTRAP_ADMIN_*`).
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return

  loadDotenv({
    path: candidateEnvFiles(),
    quiet: true,
  })
}

loadEnvironment()
