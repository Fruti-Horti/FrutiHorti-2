-- Migração 001: estoque por lote (T10 / RF-08 / RNF-04)
-- Aplica-se a bancos criados pelo hortifruti_basico.sql anterior, em que cada produto tinha um único
-- lote (produtos.lote_id). Preserva produtos, saldos e movimentações.
-- Retorno: db/migrations/001_stock_by_lot.rollback.sql
-- Faça backup antes de aplicar (mysqldump).

CREATE TABLE estoque_lote (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    lote_id INT NOT NULL,
    quantidade INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_estoque_lote_produto_lote UNIQUE (produto_id, lote_id),
    CONSTRAINT fk_estoque_lote_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_estoque_lote_lote
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT chk_estoque_lote_quantidade CHECK (quantidade >= 0)
);

-- Cada produto leva o saldo atual para o lote que tinha.
INSERT INTO estoque_lote (produto_id, lote_id, quantidade)
SELECT p.id, p.lote_id, COALESCE(e.quantidade, 0)
FROM produtos p
LEFT JOIN estoque e ON e.produto_id = p.id;

-- Movimentações passam a registrar o lote movimentado.
ALTER TABLE movimentacoes_estoque
    ADD COLUMN lote_id INT DEFAULT NULL AFTER produto_id;

UPDATE movimentacoes_estoque m
INNER JOIN produtos p ON p.id = m.produto_id
SET m.lote_id = p.lote_id;

ALTER TABLE movimentacoes_estoque
    ADD CONSTRAINT fk_movimentacao_lote
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

-- O produto deixa de apontar para um único lote.
ALTER TABLE produtos DROP FOREIGN KEY fk_produto_lote;
ALTER TABLE produtos DROP COLUMN lote_id;
