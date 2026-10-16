-- Retorno da migração 001: volta ao modelo de um lote por produto.
-- Cada produto volta a apontar para o lote de menor validade que ainda tem saldo (ou, sem saldo,
-- para o de menor validade). O saldo total em estoque.quantidade é mantido; a divisão do saldo
-- entre lotes se perde, porque o modelo antigo não tem como representá-la.
-- Depois do retorno, use uma versão do backend anterior ao estoque por lote.

ALTER TABLE produtos ADD COLUMN lote_id INT DEFAULT NULL AFTER categoria_id;

UPDATE produtos p
SET p.lote_id = (
    SELECT el.lote_id
    FROM estoque_lote el
    INNER JOIN lotes l ON l.id = el.lote_id
    WHERE el.produto_id = p.id
    ORDER BY (el.quantidade > 0) DESC, l.data_validade ASC, l.id ASC
    LIMIT 1
);

ALTER TABLE produtos MODIFY lote_id INT NOT NULL;

ALTER TABLE produtos
    ADD CONSTRAINT fk_produto_lote
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;

ALTER TABLE movimentacoes_estoque DROP FOREIGN KEY fk_movimentacao_lote;
ALTER TABLE movimentacoes_estoque DROP COLUMN lote_id;

DROP TABLE estoque_lote;
