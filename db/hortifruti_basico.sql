-- Modelo MySQL para o sistema de hortifrúti
-- Tabelas principais: categoria, lote, status, produto, estoque, movimentações de estoque,
-- usuários e administradores

DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS movimentacoes_estoque;
DROP TABLE IF EXISTS estoque;
DROP TABLE IF EXISTS produtos;
DROP TABLE IF EXISTS lotes;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS status;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    cargo VARCHAR(50) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_admin_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL UNIQUE,
    descricao VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE lotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_lote VARCHAR(50) NOT NULL UNIQUE,
    data_entrada DATE NOT NULL,
    data_validade DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    categoria_id INT NOT NULL,
    lote_id INT NOT NULL,
    status_id INT NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    perecivel TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_produto_categoria
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_produto_lote
        FOREIGN KEY (lote_id) REFERENCES lotes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_produto_status
        FOREIGN KEY (status_id) REFERENCES status(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

CREATE TABLE estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL UNIQUE,
    quantidade INT NOT NULL DEFAULT 0,
    quantidade_minima INT NOT NULL DEFAULT 0,
    localizacao VARCHAR(100),
    ultima_atualizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_estoque_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Histórico de entradas e saídas de estoque, usado para rastreabilidade e auditoria
-- (FRUT-4/FRUT-5: registro de entrada e saída do estoque)
CREATE TABLE movimentacoes_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    tipo ENUM('entrada', 'saida') NOT NULL,
    subtipo VARCHAR(30) DEFAULT NULL COMMENT 'Para saida: venda, perda, ajuste ou outro',
    quantidade INT NOT NULL,
    quantidade_anterior INT NOT NULL,
    quantidade_atual INT NOT NULL,
    motivo VARCHAR(255),
    data_movimentacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movimentacao_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT chk_movimentacao_quantidade CHECK (quantidade > 0)
);

INSERT INTO status (id, nome, descricao) VALUES
(1, 'ativo', 'Produto disponível para venda'),
(2, 'inativo', 'Produto temporariamente indisponível'),
(3, 'esgotado', 'Produto sem quantidade em estoque'),
(4, 'vencido', 'Produto fora da validade');

INSERT INTO categorias (nome, descricao) VALUES
('Fruta', 'Frutas frescas de alta saída'),
('Legume', 'Legumes para consumo diário'),
('Verdura', 'Verduras folhosas perecíveis');

INSERT INTO lotes (codigo_lote, data_entrada, data_validade) VALUES
('L20260821-01', '2026-08-21', '2026-08-28'),
('L20260821-02', '2026-08-21', '2026-08-25'),
('L20260821-03', '2026-08-21', '2026-08-23');

INSERT INTO produtos (nome, categoria_id, lote_id, status_id, preco_unitario, perecivel) VALUES
('Banana Prata', 1, 1, 1, 6.50, 1),
('Tomate', 2, 2, 1, 8.90, 1),
('Alface Crespa', 3, 3, 1, 3.50, 1);

INSERT INTO estoque (produto_id, quantidade, quantidade_minima, localizacao) VALUES
(1, 120, 20, 'Prateleira A1'),
(2, 90, 15, 'Prateleira B2'),
(3, 60, 10, 'Prateleira C3');

INSERT INTO movimentacoes_estoque (produto_id, tipo, subtipo, quantidade, quantidade_anterior, quantidade_atual, motivo) VALUES
(1, 'entrada', NULL, 120, 0, 120, 'Carga inicial de dados'),
(2, 'entrada', NULL, 90, 0, 90, 'Carga inicial de dados'),
(3, 'entrada', NULL, 60, 0, 60, 'Carga inicial de dados');
