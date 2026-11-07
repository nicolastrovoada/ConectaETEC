import { DatabaseSync } from "node:sqlite"
import { config } from "../config"

let instance: DatabaseSync | null = null

/**
 * Funções SQL da aplicação, registradas na própria conexão.
 *
 * `namekey(x)` é a chave de busca de TEXTO: minúsculas e SEM acento (NFD → sem
 * diacríticos). Ela existe porque o `lower()` do SQLite só dobra ASCII — em uma
 * lista de nomeação pt-BR, `lower(name)` não acha "José", "Antônio" nem
 * "Conceição" a partir de "Jose"/"Antonio"/"Conceicao".
 *
 * Registrar a função na CONEXÃO, e não guardar uma coluna `nameKey` na tabela,
 * é uma escolha deliberada: a chave nunca fica desatualizada, porque não existe
 * caminho de escrita (seed, cadastro, edição de perfil pela coordenação) que
 * precise lembrar de recalcular. O preço é uma chamada de JS por linha
 * comparada — irrelevante na tabela de usuários, e o filtro nem é por índice.
 *
 * `deterministic: true` diz ao planejador que a função dá o mesmo resultado
 * para o mesmo argumento (é verdade: não depende de data, fuso nem estado).
 */
function registerFunctions(db: DatabaseSync): void {
  db.function("namekey", { deterministic: true }, (value) => {
    if (typeof value !== "string") return value
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  })
}

/**
 * Singleton da conexão SQLite (node:sqlite).
 * Em testes usa-se DB_PATH=":memory:": cada reabertura cria um banco novo.
 */
export function getDb(): DatabaseSync {
  if (!instance) {
    const dbPath = config.dbPath
    instance = new DatabaseSync(dbPath)
    registerFunctions(instance)
    if (dbPath !== ":memory:") {
      instance.exec("PRAGMA journal_mode = WAL")
      // Multi-processo: espera (5s) em vez de falhar na 1ª disputa de write lock
      // (Frente 2 — corrida de resgate entre requisições/processos).
      instance.exec("PRAGMA busy_timeout = 5000")
    }
    // FKs nativas (Frente 5) valem também em :memory: para que os testes
    // exercitem as mesmas garantias do banco em arquivo. O runner de migrações
    // abre uma janela OFF só em volta do trecho de migrações marcado
    // `needsForeignKeysOff` (rebuild de tabela, que exige FKs desligadas) e
    // devolve a conexão ao estado ORIGINAL no fim — quem entrou com as FKs
    // desligadas continua desligado.
    instance.exec("PRAGMA foreign_keys = ON")
  }
  return instance
}

/** Fecha a conexão atual (usado pelos testes para reiniciar o banco). */
export function resetDb(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}