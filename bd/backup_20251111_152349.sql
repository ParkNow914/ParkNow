--
-- PostgreSQL database dump
--

\restrict gnydz5qIcvLaEb5h3ywbcUFOfdEKb8mlHjauF0tZwdAf1AoelmpoMXvApiYnDPN

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-11-11 15:23:50

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 882 (class 1247 OID 52107)
-- Name: enum_usuarios_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.enum_usuarios_status AS ENUM (
    'ativo',
    'inativo',
    'suspenso'
);


ALTER TYPE public.enum_usuarios_status OWNER TO postgres;

--
-- TOC entry 885 (class 1247 OID 52114)
-- Name: enum_usuarios_tipo_usuario; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.enum_usuarios_tipo_usuario AS ENUM (
    'cliente',
    'admin',
    'funcionario'
);


ALTER TYPE public.enum_usuarios_tipo_usuario OWNER TO postgres;

--
-- TOC entry 888 (class 1247 OID 52122)
-- Name: pagamento_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.pagamento_status AS ENUM (
    'pending',
    'processing',
    'paid',
    'approved',
    'declined',
    'refunded',
    'cancelled',
    'failed',
    'pendente',
    'aprovado',
    'recusado',
    'reembolsado',
    'cancelado'
);


ALTER TYPE public.pagamento_status OWNER TO postgres;

--
-- TOC entry 891 (class 1247 OID 52150)
-- Name: status_pagamento_pix; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.status_pagamento_pix AS ENUM (
    'pending',
    'approved',
    'authorized',
    'in_process',
    'in_mediation',
    'rejected',
    'cancelled',
    'refunded',
    'charged_back'
);


ALTER TYPE public.status_pagamento_pix OWNER TO postgres;

--
-- TOC entry 249 (class 1255 OID 52169)
-- Name: atualizar_data_atualizacao(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.atualizar_data_atualizacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.data_atualizacao = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.atualizar_data_atualizacao() OWNER TO postgres;

--
-- TOC entry 250 (class 1255 OID 52170)
-- Name: check_email_across_tables(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_email_across_tables() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Se estamos inserindo/atualizando em usuarios, verifica se email existe em admins
    IF TG_TABLE_NAME = 'usuarios' THEN
        IF EXISTS (SELECT 1 FROM admins WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % jÃ¡ cadastrado como administrador', NEW.email;
        END IF;
    -- Se estamos inserindo/atualizando em admins, verifica se email existe em usuarios
    ELSIF TG_TABLE_NAME = 'admins' THEN
        IF EXISTS (SELECT 1 FROM usuarios WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Email % jÃ¡ cadastrado como usuÃ¡rio', NEW.email;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.check_email_across_tables() OWNER TO postgres;

--
-- TOC entry 251 (class 1255 OID 52171)
-- Name: limpar_chave_pix(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.limpar_chave_pix() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Remove a chave_pix da tabela estacionamentos quando um registro for excluÃ­do em estacionamento_pagamentos
    UPDATE estacionamentos
    SET chave_pix = NULL,
        data_atualizacao = NOW()
    WHERE id = OLD.estacionamento_id;
    
    RETURN OLD;
END;
$$;


ALTER FUNCTION public.limpar_chave_pix() OWNER TO postgres;

--
-- TOC entry 252 (class 1255 OID 52172)
-- Name: sincronizar_chave_pix(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sincronizar_chave_pix() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Atualiza a chave_pix na tabela estacionamentos quando um registro for inserido ou atualizado em estacionamento_pagamentos
    UPDATE estacionamentos
    SET chave_pix = NEW.chave_pix,
        data_atualizacao = NOW()
    WHERE id = NEW.estacionamento_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sincronizar_chave_pix() OWNER TO postgres;

--
-- TOC entry 253 (class 1255 OID 52173)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 52174)
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


ALTER TABLE public."SequelizeMeta" OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 52177)
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    senha character varying(255) NOT NULL,
    nivel_acesso character varying(20) DEFAULT 'operador'::character varying NOT NULL,
    status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
    ultimo_acesso timestamp with time zone,
    reset_token character varying(255),
    reset_token_expires timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    refresh_token_hash character varying(255),
    telefone character varying(15),
    cnpj character varying(18)
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- TOC entry 5102 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN admins.telefone; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.admins.telefone IS 'Telefone de contato do administrador';


--
-- TOC entry 5103 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN admins.cnpj; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.admins.cnpj IS 'CNPJ do estacionamento (cadastrado pelo admin)';


--
-- TOC entry 219 (class 1259 OID 52186)
-- Name: admins_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admins_id_seq OWNER TO postgres;

--
-- TOC entry 5104 (class 0 OID 0)
-- Dependencies: 219
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- TOC entry 220 (class 1259 OID 52187)
-- Name: estacionamentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.estacionamentos (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    cnpj character varying(18),
    endereco text,
    telefone character varying(15),
    email character varying(100),
    capacidade_total integer NOT NULL,
    vagas_disponiveis integer NOT NULL,
    valor_hora numeric(10,2) NOT NULL,
    valor_diaria numeric(10,2) NOT NULL,
    valor_mensal numeric(10,2) NOT NULL,
    horario_abertura time without time zone NOT NULL,
    horario_fechamento time without time zone NOT NULL,
    status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
    data_cadastro timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    latitude numeric(10,8),
    longitude numeric(11,8),
    vagas integer DEFAULT 0 NOT NULL,
    preco_hora numeric(10,2) DEFAULT 5.00 NOT NULL,
    preco_dia numeric(10,2) DEFAULT 30.00 NOT NULL,
    descricao text,
    foto text,
    admin_id integer,
    chave_pix_cnpj character varying(255),
    id_solicitacao integer,
    chave_pix character varying(140),
    tipo_chave_pix character varying(20),
    nome_titular_pix character varying(100),
    asaas_wallet_id character varying(100),
    asaas_connected_at timestamp with time zone,
    cep character varying(9),
    logradouro character varying(255),
    numero character varying(20),
    complemento character varying(100),
    bairro character varying(100),
    cidade character varying(100),
    uf character(2),
    asaas_customer_id character varying(255)
);


ALTER TABLE public.estacionamentos OWNER TO postgres;

--
-- TOC entry 5105 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.latitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.latitude IS 'Latitude geográfica do estacionamento';


--
-- TOC entry 5106 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.longitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.longitude IS 'Longitude geográfica do estacionamento';


--
-- TOC entry 5107 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.vagas; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.vagas IS 'Número total de vagas do estacionamento';


--
-- TOC entry 5108 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.preco_hora; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.preco_hora IS 'Preço por hora do estacionamento';


--
-- TOC entry 5109 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.preco_dia; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.preco_dia IS 'Preço por dia do estacionamento';


--
-- TOC entry 5110 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.descricao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.descricao IS 'Descrição do estacionamento';


--
-- TOC entry 5111 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.foto; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.foto IS 'URL da foto do estacionamento';


--
-- TOC entry 5112 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.chave_pix IS 'Chave PIX do estacionamento (mantida em sincronia com estacionamento_pagamentos)';


--
-- TOC entry 5113 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.tipo_chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, telefone, email, aleatoria)';


--
-- TOC entry 5114 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.nome_titular_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.nome_titular_pix IS 'Nome do titular da conta PIX';


--
-- TOC entry 5115 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.asaas_wallet_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.asaas_wallet_id IS 'ID da subconta (wallet) no Asaas para receber splits';


--
-- TOC entry 5116 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.asaas_connected_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.asaas_connected_at IS 'Data de conexÃ£o com o Asaas';


--
-- TOC entry 5117 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.cep; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.cep IS 'CEP do estacionamento (formato: 00000-000)';


--
-- TOC entry 5118 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.logradouro; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.logradouro IS 'Logradouro (Rua, Avenida, etc)';


--
-- TOC entry 5119 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.numero; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.numero IS 'NÃºmero do endereÃ§o';


--
-- TOC entry 5120 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.complemento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.complemento IS 'Complemento do endereÃ§o (opcional)';


--
-- TOC entry 5121 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.bairro; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.bairro IS 'Bairro';


--
-- TOC entry 5122 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.cidade; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.cidade IS 'Cidade';


--
-- TOC entry 5123 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.uf; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.uf IS 'Unidade Federativa (Estado)';


--
-- TOC entry 5124 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN estacionamentos.asaas_customer_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.asaas_customer_id IS 'ID do customer do estacionamento no Asaas';


--
-- TOC entry 221 (class 1259 OID 52197)
-- Name: configuracao_pagamento_estacionamento; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.configuracao_pagamento_estacionamento AS
 SELECT id AS estacionamento_id,
    chave_pix,
    email,
    'pix'::text AS metodo_pagamento,
    true AS ativo
   FROM public.estacionamentos e;


ALTER VIEW public.configuracao_pagamento_estacionamento OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 52201)
-- Name: estacionamento_pagamentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.estacionamento_pagamentos (
    id integer NOT NULL,
    estacionamento_id integer NOT NULL,
    tipo_chave_pix character varying(20) NOT NULL,
    chave_pix character varying(140) NOT NULL,
    nome_titular character varying(255) NOT NULL,
    banco character varying(100),
    tipo_conta character varying(20) DEFAULT 'CONTA_CORRENTE'::character varying,
    agencia character varying(20),
    conta character varying(50),
    data_criacao timestamp with time zone DEFAULT now(),
    data_atualizacao timestamp with time zone DEFAULT now(),
    data_exclusao timestamp with time zone,
    CONSTRAINT ck_tipo_chave_pix_valido CHECK (((tipo_chave_pix)::text = ANY (ARRAY[('CPF'::character varying)::text, ('CNPJ'::character varying)::text, ('EMAIL'::character varying)::text, ('TELEFONE'::character varying)::text, ('ALEATORIA'::character varying)::text]))),
    CONSTRAINT ck_tipo_conta_valido CHECK (((tipo_conta)::text = ANY (ARRAY[('CONTA_CORRENTE'::character varying)::text, ('CONTA_POUPANCA'::character varying)::text, ('CONTA_PAGAMENTO'::character varying)::text])))
);


ALTER TABLE public.estacionamento_pagamentos OWNER TO postgres;

--
-- TOC entry 5125 (class 0 OID 0)
-- Dependencies: 222
-- Name: TABLE estacionamento_pagamentos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.estacionamento_pagamentos IS 'Armazena as configuraÃ§Ãµes de pagamento dos estacionamentos, incluindo chaves PIX e dados bancÃ¡rios';


--
-- TOC entry 5126 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.estacionamento_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.estacionamento_id IS 'ReferÃªncia ao estacionamento';


--
-- TOC entry 5127 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.tipo_chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA)';


--
-- TOC entry 5128 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.chave_pix IS 'Valor da chave PIX';


--
-- TOC entry 5129 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.nome_titular; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.nome_titular IS 'Nome do titular da conta';


--
-- TOC entry 5130 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.banco; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.banco IS 'Nome do banco (opcional)';


--
-- TOC entry 5131 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.tipo_conta; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.tipo_conta IS 'Tipo de conta bancÃ¡ria';


--
-- TOC entry 5132 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.agencia; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.agencia IS 'NÃºmero da agÃªncia (opcional)';


--
-- TOC entry 5133 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.conta; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.conta IS 'NÃºmero da conta (opcional)';


--
-- TOC entry 223 (class 1259 OID 52211)
-- Name: estacionamento_pagamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.estacionamento_pagamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estacionamento_pagamentos_id_seq OWNER TO postgres;

--
-- TOC entry 5134 (class 0 OID 0)
-- Dependencies: 223
-- Name: estacionamento_pagamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estacionamento_pagamentos_id_seq OWNED BY public.estacionamento_pagamentos.id;


--
-- TOC entry 224 (class 1259 OID 52212)
-- Name: estacionamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.estacionamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.estacionamentos_id_seq OWNER TO postgres;

--
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 224
-- Name: estacionamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estacionamentos_id_seq OWNED BY public.estacionamentos.id;


--
-- TOC entry 225 (class 1259 OID 52213)
-- Name: horarios_funcionamento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.horarios_funcionamento (
    id integer NOT NULL,
    estacionamento_id integer NOT NULL,
    dia_semana integer NOT NULL,
    aberto boolean DEFAULT true NOT NULL,
    horario_abertura time without time zone,
    horario_fechamento time without time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_horario_valido CHECK (((aberto = false) OR ((aberto = true) AND (horario_abertura IS NOT NULL) AND (horario_fechamento IS NOT NULL))))
);


ALTER TABLE public.horarios_funcionamento OWNER TO postgres;

--
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 225
-- Name: TABLE horarios_funcionamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.horarios_funcionamento IS 'Tabela de horários de funcionamento dos estacionamentos';


--
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.id IS 'ID único do horário de funcionamento';


--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.estacionamento_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.estacionamento_id IS 'ID do estacionamento';


--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.dia_semana; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.dia_semana IS 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)';


--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.aberto; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.aberto IS 'Se o estacionamento está aberto neste dia';


--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.horario_abertura; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.horario_abertura IS 'Horário de abertura (HH:MM:SS)';


--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.horario_fechamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.horario_fechamento IS 'Horário de fechamento (HH:MM:SS)';


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.created_at IS 'Data de criação do registro';


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN horarios_funcionamento.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.updated_at IS 'Data da última atualização do registro';


--
-- TOC entry 226 (class 1259 OID 52220)
-- Name: horarios_funcionamento_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.horarios_funcionamento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.horarios_funcionamento_id_seq OWNER TO postgres;

--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 226
-- Name: horarios_funcionamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.horarios_funcionamento_id_seq OWNED BY public.horarios_funcionamento.id;


--
-- TOC entry 227 (class 1259 OID 52221)
-- Name: logs_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.logs_admins (
    id integer NOT NULL,
    admin_id integer,
    acao character varying(50) NOT NULL,
    tabela_afetada character varying(50),
    registro_id integer,
    valores_antigos jsonb,
    valores_novos jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.logs_admins OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 52227)
-- Name: logs_admins_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.logs_admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_admins_id_seq OWNER TO postgres;

--
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 228
-- Name: logs_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.logs_admins_id_seq OWNED BY public.logs_admins.id;


--
-- TOC entry 229 (class 1259 OID 52228)
-- Name: logs_veiculos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.logs_veiculos (
    id integer NOT NULL,
    vaga_id integer,
    estacionamento_id integer,
    usuario_id integer,
    tipo_operacao character varying(20) NOT NULL,
    placa_veiculo character varying(10),
    data_hora timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    detalhes text,
    saida timestamp with time zone,
    tempo_estacionado integer DEFAULT 0,
    valor_pago numeric(10,2),
    entrada timestamp with time zone,
    CONSTRAINT logs_veiculos_tipo_operacao_check CHECK (((tipo_operacao)::text = ANY (ARRAY[('entrada'::character varying)::text, ('saida'::character varying)::text, ('reserva'::character varying)::text, ('cancelamento'::character varying)::text])))
);


ALTER TABLE public.logs_veiculos OWNER TO postgres;

--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 229
-- Name: COLUMN logs_veiculos.saida; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.logs_veiculos.saida IS 'Data/hora de saÃ­da do veÃ­culo';


--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 229
-- Name: COLUMN logs_veiculos.tempo_estacionado; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.logs_veiculos.tempo_estacionado IS 'Tempo estacionado em segundos';


--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 229
-- Name: COLUMN logs_veiculos.valor_pago; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.logs_veiculos.valor_pago IS 'Valor pago pelo estacionamento';


--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 229
-- Name: COLUMN logs_veiculos.entrada; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.logs_veiculos.entrada IS 'Data/hora de entrada do veÃ­culo';


--
-- TOC entry 230 (class 1259 OID 52235)
-- Name: logs_veiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.logs_veiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_veiculos_id_seq OWNER TO postgres;

--
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 230
-- Name: logs_veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.logs_veiculos_id_seq OWNED BY public.logs_veiculos.id;


--
-- TOC entry 231 (class 1259 OID 52236)
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notificacoes (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    tipo character varying(50) NOT NULL,
    titulo character varying(255) NOT NULL,
    mensagem text NOT NULL,
    dados jsonb,
    lida boolean DEFAULT false,
    data_criacao timestamp without time zone DEFAULT now(),
    data_leitura timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.notificacoes OWNER TO postgres;

--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 231
-- Name: TABLE notificacoes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.notificacoes IS 'Tabela para armazenar notificaÃ§Ãµes do sistema';


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.usuario_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.usuario_id IS 'ID do usuÃ¡rio que receberÃ¡ a notificaÃ§Ã£o';


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.tipo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.tipo IS 'Tipo da notificaÃ§Ã£o (pix_copiado, pix_visualizado, pagamento_confirmado, etc)';


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.titulo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.titulo IS 'TÃ­tulo da notificaÃ§Ã£o';


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.mensagem; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.mensagem IS 'Mensagem/corpo da notificaÃ§Ã£o';


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.dados; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.dados IS 'Dados adicionais em formato JSON';


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.lida; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.lida IS 'Se a notificaÃ§Ã£o foi lida ou nÃ£o';


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.data_criacao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.data_criacao IS 'Data e hora de criaÃ§Ã£o da notificaÃ§Ã£o';


--
-- TOC entry 5160 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN notificacoes.data_leitura; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.data_leitura IS 'Data e hora em que a notificaÃ§Ã£o foi lida';


--
-- TOC entry 232 (class 1259 OID 52245)
-- Name: notificacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.notificacoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.notificacoes_id_seq OWNER TO postgres;

--
-- TOC entry 5161 (class 0 OID 0)
-- Dependencies: 232
-- Name: notificacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notificacoes_id_seq OWNED BY public.notificacoes.id;


--
-- TOC entry 233 (class 1259 OID 52246)
-- Name: pagamentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagamentos (
    id integer NOT NULL,
    reserva_id integer NOT NULL,
    id_estacionamento integer NOT NULL,
    id_usuario integer NOT NULL,
    valor numeric(10,2) NOT NULL,
    metodo_pagamento character varying(50) NOT NULL,
    codigo_transacao character varying(100),
    dados_retorno jsonb,
    data_pagamento timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp without time zone,
    gateway character varying(50) DEFAULT 'asaas'::character varying NOT NULL,
    parcelas integer DEFAULT 1,
    status public.pagamento_status NOT NULL
);


ALTER TABLE public.pagamentos OWNER TO postgres;

--
-- TOC entry 5162 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.metodo_pagamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.metodo_pagamento IS 'MÃ©todo de pagamento (ex: credit_card, boleto, pix)';


--
-- TOC entry 5163 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.codigo_transacao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.codigo_transacao IS 'CÃ³digo da transaÃ§Ã£o no gateway de pagamento';


--
-- TOC entry 5164 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.dados_retorno; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.dados_retorno IS 'Dados adicionais retornados pelo gateway de pagamento';


--
-- TOC entry 5165 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.data_pagamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.data_pagamento IS 'Data em que o pagamento foi confirmado pelo gateway';


--
-- TOC entry 5166 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.gateway; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.gateway IS 'Nome do gateway de pagamento usado (ex: pagarme, mercadopago)';


--
-- TOC entry 5167 (class 0 OID 0)
-- Dependencies: 233
-- Name: COLUMN pagamentos.parcelas; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.parcelas IS 'NÃºmero de parcelas do pagamento';


--
-- TOC entry 234 (class 1259 OID 52255)
-- Name: pagamentos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagamentos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagamentos_id_seq OWNER TO postgres;

--
-- TOC entry 5168 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagamentos_id_seq OWNED BY public.pagamentos.id;


--
-- TOC entry 235 (class 1259 OID 52256)
-- Name: pagamentos_pix; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagamentos_pix (
    id integer NOT NULL,
    id_reserva integer,
    id_estacionamento integer NOT NULL,
    id_usuario integer NOT NULL,
    valor numeric(10,2) NOT NULL,
    chave_pix_destinatario character varying(255) NOT NULL,
    status public.status_pagamento_pix DEFAULT 'pending'::public.status_pagamento_pix NOT NULL,
    qr_code text,
    qr_code_base64 text,
    codigo_copia_cola text,
    data_expiracao timestamp with time zone,
    data_pagamento timestamp with time zone,
    dados_retorno jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


ALTER TABLE public.pagamentos_pix OWNER TO postgres;

--
-- TOC entry 236 (class 1259 OID 52264)
-- Name: pagamentos_pix_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pagamentos_pix_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pagamentos_pix_id_seq OWNER TO postgres;

--
-- TOC entry 5169 (class 0 OID 0)
-- Dependencies: 236
-- Name: pagamentos_pix_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagamentos_pix_id_seq OWNED BY public.pagamentos_pix.id;


--
-- TOC entry 237 (class 1259 OID 52265)
-- Name: reservas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reservas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    vaga_id integer NOT NULL,
    estacionamento_id integer NOT NULL,
    data_reserva timestamp without time zone NOT NULL,
    data_entrada_prevista timestamp without time zone NOT NULL,
    data_saida_prevista timestamp without time zone NOT NULL,
    data_entrada_real timestamp without time zone,
    data_saida_real timestamp without time zone,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    valor_total numeric(10,2),
    forma_pagamento character varying(50),
    status_pagamento character varying(20) DEFAULT 'pendente'::character varying,
    codigo_reserva character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    placa_veiculo character varying(10) NOT NULL,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    id_pagamento character varying(100),
    CONSTRAINT reservas_status_check CHECK (((status)::text = ANY (ARRAY[('pendente'::character varying)::text, ('pendente_pagamento'::character varying)::text, ('confirmada'::character varying)::text, ('ativa'::character varying)::text, ('em_andamento'::character varying)::text, ('concluida'::character varying)::text, ('finalizada'::character varying)::text, ('cancelada'::character varying)::text, ('expirada'::character varying)::text, ('nao_compareceu'::character varying)::text, ('pagamento_aprovado'::character varying)::text, ('pagamento_recusado'::character varying)::text])))
);


ALTER TABLE public.reservas OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 52274)
-- Name: reservas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reservas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reservas_id_seq OWNER TO postgres;

--
-- TOC entry 5170 (class 0 OID 0)
-- Dependencies: 238
-- Name: reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reservas_id_seq OWNED BY public.reservas.id;


--
-- TOC entry 239 (class 1259 OID 52275)
-- Name: solicitacoes_estacionamento; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.solicitacoes_estacionamento (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    cnpj character varying(18) NOT NULL,
    razao_social character varying(255) NOT NULL,
    nome_fantasia character varying(255),
    chave_pix_cnpj character varying(255) NOT NULL,
    endereco jsonb NOT NULL,
    telefone character varying(20) NOT NULL,
    email_contato character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    motivo_rejeicao text,
    data_solicitacao timestamp with time zone DEFAULT now(),
    data_aprovacao timestamp with time zone,
    aprovado_por integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


ALTER TABLE public.solicitacoes_estacionamento OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 52284)
-- Name: solicitacoes_estacionamento_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.solicitacoes_estacionamento_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.solicitacoes_estacionamento_id_seq OWNER TO postgres;

--
-- TOC entry 5171 (class 0 OID 0)
-- Dependencies: 240
-- Name: solicitacoes_estacionamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.solicitacoes_estacionamento_id_seq OWNED BY public.solicitacoes_estacionamento.id;


--
-- TOC entry 241 (class 1259 OID 52285)
-- Name: tipos_veiculos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tipos_veiculos (
    id integer NOT NULL,
    nome character varying(50) NOT NULL,
    descricao text,
    fator_preco numeric(3,2) DEFAULT 1.00
);


ALTER TABLE public.tipos_veiculos OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 52291)
-- Name: tipos_veiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.tipos_veiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.tipos_veiculos_id_seq OWNER TO postgres;

--
-- TOC entry 5172 (class 0 OID 0)
-- Dependencies: 242
-- Name: tipos_veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tipos_veiculos_id_seq OWNED BY public.tipos_veiculos.id;


--
-- TOC entry 243 (class 1259 OID 52292)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    cpf character varying(14),
    telefone character varying(15),
    senha character varying(255) NOT NULL,
    tipo_usuario character varying(20) DEFAULT 'cliente'::character varying NOT NULL,
    status character varying(20) DEFAULT 'ativo'::character varying NOT NULL,
    data_cadastro timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ultimo_acesso timestamp without time zone,
    reset_token character varying(255),
    reset_token_expires timestamp without time zone,
    email_verified_at timestamp without time zone,
    tipo_veiculo character varying(50),
    placa_veiculo character varying(10),
    refresh_token_hash text,
    foto_perfil text
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 5173 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN usuarios.tipo_veiculo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.tipo_veiculo IS 'Tipo de veículo do usuário (ex: carro, moto, etc.)';


--
-- TOC entry 5174 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN usuarios.placa_veiculo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.placa_veiculo IS 'Placa do veículo do usuário';


--
-- TOC entry 5175 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN usuarios.refresh_token_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.refresh_token_hash IS 'Hash do refresh token JWT para invalidar tokens';


--
-- TOC entry 5176 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN usuarios.foto_perfil; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.foto_perfil IS 'URL da foto de perfil do usuário';


--
-- TOC entry 244 (class 1259 OID 52300)
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO postgres;

--
-- TOC entry 5177 (class 0 OID 0)
-- Dependencies: 244
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- TOC entry 245 (class 1259 OID 52301)
-- Name: vagas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vagas (
    id integer NOT NULL,
    numero integer NOT NULL,
    estacionamento_id integer NOT NULL,
    status character varying(20) DEFAULT 'livre'::character varying NOT NULL,
    placa character varying(10),
    tipo_veiculo character varying(50),
    entrada timestamp without time zone,
    tempo_estacionado integer DEFAULT 0,
    usuario_id integer,
    reserva_id_ativa integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT vagas_status_check CHECK (((status)::text = ANY (ARRAY[('livre'::character varying)::text, ('ocupada'::character varying)::text, ('reservada'::character varying)::text, ('indisponivel'::character varying)::text])))
);


ALTER TABLE public.vagas OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 52309)
-- Name: vagas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vagas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vagas_id_seq OWNER TO postgres;

--
-- TOC entry 5178 (class 0 OID 0)
-- Dependencies: 246
-- Name: vagas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vagas_id_seq OWNED BY public.vagas.id;


--
-- TOC entry 247 (class 1259 OID 52310)
-- Name: veiculos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.veiculos (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    tipo_veiculo character varying(20) NOT NULL,
    placa_veiculo character varying(10) NOT NULL,
    padrao boolean DEFAULT false NOT NULL,
    data_cadastro timestamp with time zone DEFAULT now(),
    data_atualizacao timestamp with time zone DEFAULT now()
);


ALTER TABLE public.veiculos OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 52316)
-- Name: veiculos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.veiculos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.veiculos_id_seq OWNER TO postgres;

--
-- TOC entry 5179 (class 0 OID 0)
-- Dependencies: 248
-- Name: veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.veiculos_id_seq OWNED BY public.veiculos.id;


--
-- TOC entry 4736 (class 2604 OID 52317)
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- TOC entry 4747 (class 2604 OID 52318)
-- Name: estacionamento_pagamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos ALTER COLUMN id SET DEFAULT nextval('public.estacionamento_pagamentos_id_seq'::regclass);


--
-- TOC entry 4741 (class 2604 OID 52319)
-- Name: estacionamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos ALTER COLUMN id SET DEFAULT nextval('public.estacionamentos_id_seq'::regclass);


--
-- TOC entry 4751 (class 2604 OID 52320)
-- Name: horarios_funcionamento id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento ALTER COLUMN id SET DEFAULT nextval('public.horarios_funcionamento_id_seq'::regclass);


--
-- TOC entry 4755 (class 2604 OID 52321)
-- Name: logs_admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_admins ALTER COLUMN id SET DEFAULT nextval('public.logs_admins_id_seq'::regclass);


--
-- TOC entry 4757 (class 2604 OID 52322)
-- Name: logs_veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos ALTER COLUMN id SET DEFAULT nextval('public.logs_veiculos_id_seq'::regclass);


--
-- TOC entry 4760 (class 2604 OID 52323)
-- Name: notificacoes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes ALTER COLUMN id SET DEFAULT nextval('public.notificacoes_id_seq'::regclass);


--
-- TOC entry 4765 (class 2604 OID 52324)
-- Name: pagamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos ALTER COLUMN id SET DEFAULT nextval('public.pagamentos_id_seq'::regclass);


--
-- TOC entry 4770 (class 2604 OID 52325)
-- Name: pagamentos_pix id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix ALTER COLUMN id SET DEFAULT nextval('public.pagamentos_pix_id_seq'::regclass);


--
-- TOC entry 4774 (class 2604 OID 52326)
-- Name: reservas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas ALTER COLUMN id SET DEFAULT nextval('public.reservas_id_seq'::regclass);


--
-- TOC entry 4780 (class 2604 OID 52327)
-- Name: solicitacoes_estacionamento id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento ALTER COLUMN id SET DEFAULT nextval('public.solicitacoes_estacionamento_id_seq'::regclass);


--
-- TOC entry 4785 (class 2604 OID 52328)
-- Name: tipos_veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_veiculos ALTER COLUMN id SET DEFAULT nextval('public.tipos_veiculos_id_seq'::regclass);


--
-- TOC entry 4787 (class 2604 OID 52329)
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- TOC entry 4791 (class 2604 OID 52330)
-- Name: vagas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas ALTER COLUMN id SET DEFAULT nextval('public.vagas_id_seq'::regclass);


--
-- TOC entry 4796 (class 2604 OID 52331)
-- Name: veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos ALTER COLUMN id SET DEFAULT nextval('public.veiculos_id_seq'::regclass);


--
-- TOC entry 5066 (class 0 OID 52174)
-- Dependencies: 217
-- Data for Name: SequelizeMeta; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SequelizeMeta" (name) FROM stdin;
20250612115311-add_payment_gateway_columns.js
\.


--
-- TOC entry 5067 (class 0 OID 52177)
-- Dependencies: 218
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (id, nome, email, senha, nivel_acesso, status, ultimo_acesso, reset_token, reset_token_expires, created_at, updated_at, refresh_token_hash, telefone, cnpj) FROM stdin;
1	Mateus Veneziani da Silva	alimiguel1098@hotmail.com	$2b$12$egfF9rs4ASyS3.6uU9OQYOrpnCmVYvYsCWmInxSXE/Ixj7kQdMO7i	estacionamento	ativo	\N	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03	$2b$10$hUBx35GekoJ11Qg15eiGweC6c12EI.Vi.s1qetMmY4IVr0yA80vDO	\N	19867505000186
\.


--
-- TOC entry 5070 (class 0 OID 52201)
-- Dependencies: 222
-- Data for Name: estacionamento_pagamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estacionamento_pagamentos (id, estacionamento_id, tipo_chave_pix, chave_pix, nome_titular, banco, tipo_conta, agencia, conta, data_criacao, data_atualizacao, data_exclusao) FROM stdin;
\.


--
-- TOC entry 5069 (class 0 OID 52187)
-- Dependencies: 220
-- Data for Name: estacionamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estacionamentos (id, nome, cnpj, endereco, telefone, email, capacidade_total, vagas_disponiveis, valor_hora, valor_diaria, valor_mensal, horario_abertura, horario_fechamento, status, data_cadastro, latitude, longitude, vagas, preco_hora, preco_dia, descricao, foto, admin_id, chave_pix_cnpj, id_solicitacao, chave_pix, tipo_chave_pix, nome_titular_pix, asaas_wallet_id, asaas_connected_at, cep, logradouro, numero, complemento, bairro, cidade, uf, asaas_customer_id) FROM stdin;
1	Silcar Estacionamento LTDA	19867505000186	Rua Major Oliveira Borges, 307 | Bairro: Centro | Lorena - SP | CEP: 12600-020		alimiguel1098@hotmail.com	50	50	5.00	30.00	600.00	08:00:00	20:00:00	ativo	2025-11-11 12:23:11.0702-03	-22.73208659	-45.12024105	50	5.00	30.00	Estacionamento parceiro ParkNow	\N	1	\N	\N	19867505000186	cnpj	Silcar Estacionamento LTDA	715a03eb-aef2-451e-a25c-ced035fc8e55	2025-11-11 14:42:18.542183-03	12600-020	Rua Major Oliveira Borges	307	\N	Centro	Lorena	SP	\N
\.


--
-- TOC entry 5073 (class 0 OID 52213)
-- Dependencies: 225
-- Data for Name: horarios_funcionamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.horarios_funcionamento (id, estacionamento_id, dia_semana, aberto, horario_abertura, horario_fechamento, created_at, updated_at) FROM stdin;
1	1	0	f	\N	\N	2025-10-28 21:54:55.328-03	2025-10-28 21:54:55.329-03
2	1	1	t	08:00:00	18:00:00	2025-10-28 21:54:55.329-03	2025-10-28 21:54:55.329-03
3	1	2	t	08:00:00	18:00:00	2025-10-28 21:54:55.329-03	2025-10-28 21:54:55.329-03
4	1	3	t	08:00:00	18:00:00	2025-10-28 21:54:55.329-03	2025-10-28 21:54:55.329-03
5	1	4	t	08:00:00	18:00:00	2025-10-28 21:54:55.329-03	2025-10-28 21:54:55.329-03
6	1	5	t	08:00:00	18:00:00	2025-10-28 21:54:55.329-03	2025-10-28 21:54:55.33-03
7	1	6	t	08:00:00	12:00:00	2025-10-28 21:54:55.33-03	2025-10-28 21:54:55.33-03
\.


--
-- TOC entry 5075 (class 0 OID 52221)
-- Dependencies: 227
-- Data for Name: logs_admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.logs_admins (id, admin_id, acao, tabela_afetada, registro_id, valores_antigos, valores_novos, ip_address, user_agent, created_at) FROM stdin;
1	6	Ajustou vagas Est. 5 para 50 (Add: 0, Rem: 0)	\N	\N	\N	\N	::1	\N	2025-06-23 12:07:32.859619-03
2	6	Ajustou vagas Est. 5 para 50 (Add: 0, Rem: 0)	\N	\N	\N	\N	::1	\N	2025-06-23 12:07:50.58655-03
3	1	Registrou entrada Vaga 1 (KZT3530) Est. 1	\N	\N	\N	\N	::1	\N	2025-11-11 12:25:50.19135-03
\.


--
-- TOC entry 5077 (class 0 OID 52228)
-- Dependencies: 229
-- Data for Name: logs_veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.logs_veiculos (id, vaga_id, estacionamento_id, usuario_id, tipo_operacao, placa_veiculo, data_hora, detalhes, saida, tempo_estacionado, valor_pago, entrada) FROM stdin;
\.


--
-- TOC entry 5079 (class 0 OID 52236)
-- Dependencies: 231
-- Data for Name: notificacoes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notificacoes (id, usuario_id, tipo, titulo, mensagem, dados, lida, data_criacao, data_leitura, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5081 (class 0 OID 52246)
-- Dependencies: 233
-- Data for Name: pagamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagamentos (id, reserva_id, id_estacionamento, id_usuario, valor, metodo_pagamento, codigo_transacao, dados_retorno, data_pagamento, created_at, updated_at, deleted_at, gateway, parcelas, status) FROM stdin;
1	2	1	1	10.00	pix	\N	{"payment_id": "8b222c46-3c02-456c-a6c7-27b04108b4e1", "reserva_id": 2, "data_criacao": "2025-11-11T17:47:06.608Z", "valor_pagamento": 10, "metodo_pagamento": "pix", "status_pagamento": "pendente", "comissao_plataforma": 1.5, "valor_estacionamento": 8.5}	\N	2025-11-11 14:47:06.609854	2025-11-11 14:47:06.609854	\N	asaas	1	pendente
2	3	1	1	10.00	pix	\N	{"payment_id": "277d2242-b206-45d9-97dc-a8ba49acf49b", "reserva_id": 3, "data_criacao": "2025-11-11T17:50:33.884Z", "valor_pagamento": 10, "metodo_pagamento": "pix", "status_pagamento": "pendente", "comissao_plataforma": 1.5, "valor_estacionamento": 8.5}	\N	2025-11-11 14:50:33.897301	2025-11-11 14:50:33.897301	\N	asaas	1	pendente
\.


--
-- TOC entry 5083 (class 0 OID 52256)
-- Dependencies: 235
-- Data for Name: pagamentos_pix; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagamentos_pix (id, id_reserva, id_estacionamento, id_usuario, valor, chave_pix_destinatario, status, qr_code, qr_code_base64, codigo_copia_cola, data_expiracao, data_pagamento, dados_retorno, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- TOC entry 5085 (class 0 OID 52265)
-- Dependencies: 237
-- Data for Name: reservas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservas (id, usuario_id, vaga_id, estacionamento_id, data_reserva, data_entrada_prevista, data_saida_prevista, data_entrada_real, data_saida_real, status, valor_total, forma_pagamento, status_pagamento, codigo_reserva, created_at, updated_at, placa_veiculo, data_criacao, id_pagamento) FROM stdin;
2	1	15	1	2025-11-11 14:47:06.038	2025-11-11 17:56:00	2025-11-11 18:56:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-11 14:47:06.038663	2025-11-11 14:47:44.744158	KZT4590	2025-11-11 14:47:06.038663	\N
3	1	11	1	2025-11-11 14:50:33.543	2025-11-11 18:00:00	2025-11-11 19:00:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-11 14:50:33.552694	2025-11-11 15:05:54.275211	KZT4590	2025-11-11 14:50:33.552694	\N
\.


--
-- TOC entry 5087 (class 0 OID 52275)
-- Dependencies: 239
-- Data for Name: solicitacoes_estacionamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.solicitacoes_estacionamento (id, usuario_id, cnpj, razao_social, nome_fantasia, chave_pix_cnpj, endereco, telefone, email_contato, status, motivo_rejeicao, data_solicitacao, data_aprovacao, aprovado_por, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- TOC entry 5089 (class 0 OID 52285)
-- Dependencies: 241
-- Data for Name: tipos_veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tipos_veiculos (id, nome, descricao, fator_preco) FROM stdin;
\.


--
-- TOC entry 5091 (class 0 OID 52292)
-- Dependencies: 243
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (id, nome, email, cpf, telefone, senha, tipo_usuario, status, data_cadastro, ultimo_acesso, reset_token, reset_token_expires, email_verified_at, tipo_veiculo, placa_veiculo, refresh_token_hash, foto_perfil) FROM stdin;
1	Alisson Santos	alimiguel1098@gmail.com	489.770.858-37	12991743827	$argon2id$v=19$m=65536,t=3,p=4$SsBgvHt40bxb688XZn4iUg$3JNmd8wFkKatFppnnCGwKzj+D1XTCvD3zuazOktB69M	cliente	ativo	2025-11-11 13:08:27.863295	\N	\N	\N	\N	Carro	KZT4590	$2b$10$4/3v5CI2Jxvu8M7/HfTf8uOf8UskRg33ryuMvZKOPJVGq0mHjjnvC	\N
\.


--
-- TOC entry 5093 (class 0 OID 52301)
-- Dependencies: 245
-- Data for Name: vagas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vagas (id, numero, estacionamento_id, status, placa, tipo_veiculo, entrada, tempo_estacionado, usuario_id, reserva_id_ativa, created_at, updated_at) FROM stdin;
2	2	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
3	3	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
4	4	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
5	5	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
6	6	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
7	7	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
8	8	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
9	9	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
10	10	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
12	12	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
13	13	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
14	14	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
16	16	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
17	17	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
18	18	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
19	19	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
20	20	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
21	21	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
22	22	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
23	23	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
24	24	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
25	25	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
26	26	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
27	27	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
28	28	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
29	29	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
30	30	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 12:23:11.0702-03
51	31	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
52	32	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
53	33	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
54	34	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
55	35	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
56	36	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
57	37	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
58	38	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
59	39	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
60	40	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
61	41	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
62	42	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
63	43	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
64	44	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
65	45	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
66	46	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
67	47	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
68	48	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
69	49	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
70	50	1	livre	\N	\N	\N	0	\N	\N	2025-11-11 12:25:07.885255-03	2025-11-11 12:25:07.885255-03
11	11	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 15:05:54.275211-03
1	1	1	ocupada	KZT3530	Carro	2025-11-11 12:25:50.119146	10450	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 15:20:00.085821-03
15	15	1	livre	\N	padrao	\N	0	\N	\N	2025-11-11 12:23:11.0702-03	2025-11-11 14:47:46.14279-03
\.


--
-- TOC entry 5095 (class 0 OID 52310)
-- Dependencies: 247
-- Data for Name: veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.veiculos (id, usuario_id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao) FROM stdin;
3	1	Carro	KZT4590	t	2025-11-11 13:08:27.863295-03	2025-11-11 13:08:27.863295-03
\.


--
-- TOC entry 5180 (class 0 OID 0)
-- Dependencies: 219
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admins_id_seq', 1, true);


--
-- TOC entry 5181 (class 0 OID 0)
-- Dependencies: 223
-- Name: estacionamento_pagamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estacionamento_pagamentos_id_seq', 1, false);


--
-- TOC entry 5182 (class 0 OID 0)
-- Dependencies: 224
-- Name: estacionamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estacionamentos_id_seq', 1, true);


--
-- TOC entry 5183 (class 0 OID 0)
-- Dependencies: 226
-- Name: horarios_funcionamento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.horarios_funcionamento_id_seq', 7, true);


--
-- TOC entry 5184 (class 0 OID 0)
-- Dependencies: 228
-- Name: logs_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.logs_admins_id_seq', 3, true);


--
-- TOC entry 5185 (class 0 OID 0)
-- Dependencies: 230
-- Name: logs_veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.logs_veiculos_id_seq', 1, false);


--
-- TOC entry 5186 (class 0 OID 0)
-- Dependencies: 232
-- Name: notificacoes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notificacoes_id_seq', 1, false);


--
-- TOC entry 5187 (class 0 OID 0)
-- Dependencies: 234
-- Name: pagamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagamentos_id_seq', 2, true);


--
-- TOC entry 5188 (class 0 OID 0)
-- Dependencies: 236
-- Name: pagamentos_pix_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagamentos_pix_id_seq', 1, false);


--
-- TOC entry 5189 (class 0 OID 0)
-- Dependencies: 238
-- Name: reservas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservas_id_seq', 3, true);


--
-- TOC entry 5190 (class 0 OID 0)
-- Dependencies: 240
-- Name: solicitacoes_estacionamento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.solicitacoes_estacionamento_id_seq', 1, false);


--
-- TOC entry 5191 (class 0 OID 0)
-- Dependencies: 242
-- Name: tipos_veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tipos_veiculos_id_seq', 1, false);


--
-- TOC entry 5192 (class 0 OID 0)
-- Dependencies: 244
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 1, true);


--
-- TOC entry 5193 (class 0 OID 0)
-- Dependencies: 246
-- Name: vagas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vagas_id_seq', 70, true);


--
-- TOC entry 5194 (class 0 OID 0)
-- Dependencies: 248
-- Name: veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.veiculos_id_seq', 3, true);


--
-- TOC entry 4807 (class 2606 OID 52338)
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- TOC entry 4809 (class 2606 OID 52340)
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- TOC entry 4811 (class 2606 OID 52342)
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- TOC entry 4822 (class 2606 OID 52344)
-- Name: estacionamento_pagamentos estacionamento_pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT estacionamento_pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4815 (class 2606 OID 52346)
-- Name: estacionamentos estacionamentos_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 4817 (class 2606 OID 52348)
-- Name: estacionamentos estacionamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4828 (class 2606 OID 52350)
-- Name: horarios_funcionamento horarios_funcionamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_pkey PRIMARY KEY (id);


--
-- TOC entry 4833 (class 2606 OID 52352)
-- Name: logs_admins logs_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_admins
    ADD CONSTRAINT logs_admins_pkey PRIMARY KEY (id);


--
-- TOC entry 4838 (class 2606 OID 52354)
-- Name: logs_veiculos logs_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4844 (class 2606 OID 52356)
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 4849 (class 2606 OID 52358)
-- Name: pagamentos pagamentos_codigo_transacao_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_codigo_transacao_key UNIQUE (codigo_transacao);


--
-- TOC entry 4856 (class 2606 OID 52360)
-- Name: pagamentos_pix pagamentos_pix_codigo_copia_cola_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_codigo_copia_cola_key UNIQUE (codigo_copia_cola);


--
-- TOC entry 4858 (class 2606 OID 52362)
-- Name: pagamentos_pix pagamentos_pix_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_pkey PRIMARY KEY (id);


--
-- TOC entry 4851 (class 2606 OID 52364)
-- Name: pagamentos pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4864 (class 2606 OID 52366)
-- Name: reservas reservas_codigo_reserva_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_codigo_reserva_key UNIQUE (codigo_reserva);


--
-- TOC entry 4866 (class 2606 OID 52368)
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- TOC entry 4870 (class 2606 OID 52370)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 4872 (class 2606 OID 52372)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_pkey PRIMARY KEY (id);


--
-- TOC entry 4874 (class 2606 OID 52374)
-- Name: tipos_veiculos tipos_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_veiculos
    ADD CONSTRAINT tipos_veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4826 (class 2606 OID 52376)
-- Name: estacionamento_pagamentos uk_estacionamento_pagamento; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT uk_estacionamento_pagamento UNIQUE (estacionamento_id);


--
-- TOC entry 4830 (class 2606 OID 52378)
-- Name: horarios_funcionamento unq_estacionamento_dia; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT unq_estacionamento_dia UNIQUE (estacionamento_id, dia_semana);


--
-- TOC entry 4876 (class 2606 OID 52380)
-- Name: usuarios usuarios_cpf_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_cpf_key UNIQUE (cpf);


--
-- TOC entry 4878 (class 2606 OID 52382)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 4880 (class 2606 OID 52384)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 4883 (class 2606 OID 52386)
-- Name: vagas vagas_estacionamento_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_estacionamento_id_numero_key UNIQUE (estacionamento_id, numero);


--
-- TOC entry 4885 (class 2606 OID 52388)
-- Name: vagas vagas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_pkey PRIMARY KEY (id);


--
-- TOC entry 4888 (class 2606 OID 52390)
-- Name: veiculos veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4890 (class 2606 OID 52392)
-- Name: veiculos veiculos_usuario_id_placa_veiculo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_usuario_id_placa_veiculo_key UNIQUE (usuario_id, placa_veiculo);


--
-- TOC entry 4812 (class 1259 OID 52534)
-- Name: idx_admins_cnpj; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admins_cnpj ON public.admins USING btree (cnpj);


--
-- TOC entry 4813 (class 1259 OID 52393)
-- Name: idx_admins_refresh_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admins_refresh_token ON public.admins USING btree (refresh_token_hash);


--
-- TOC entry 4823 (class 1259 OID 52394)
-- Name: idx_estacionamento_pagamentos_chave_pix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamento_pagamentos_chave_pix ON public.estacionamento_pagamentos USING btree (chave_pix);


--
-- TOC entry 4824 (class 1259 OID 52395)
-- Name: idx_estacionamento_pagamentos_estacionamento_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamento_pagamentos_estacionamento_id ON public.estacionamento_pagamentos USING btree (estacionamento_id);


--
-- TOC entry 4818 (class 1259 OID 52532)
-- Name: idx_estacionamentos_asaas_wallet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamentos_asaas_wallet ON public.estacionamentos USING btree (asaas_wallet_id);


--
-- TOC entry 4819 (class 1259 OID 52396)
-- Name: idx_estacionamentos_chave_pix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamentos_chave_pix ON public.estacionamentos USING btree (chave_pix);


--
-- TOC entry 4820 (class 1259 OID 52533)
-- Name: idx_estacionamentos_cnpj; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamentos_cnpj ON public.estacionamentos USING btree (cnpj);


--
-- TOC entry 4831 (class 1259 OID 52397)
-- Name: idx_logs_admins_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_admins_created ON public.logs_admins USING btree (created_at);


--
-- TOC entry 4834 (class 1259 OID 52398)
-- Name: idx_logs_veiculos_data; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_veiculos_data ON public.logs_veiculos USING btree (data_hora);


--
-- TOC entry 4835 (class 1259 OID 52542)
-- Name: idx_logs_veiculos_saida_null; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_veiculos_saida_null ON public.logs_veiculos USING btree (vaga_id, entrada DESC) WHERE (saida IS NULL);


--
-- TOC entry 4836 (class 1259 OID 52543)
-- Name: idx_logs_veiculos_vaga; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_veiculos_vaga ON public.logs_veiculos USING btree (vaga_id, entrada DESC);


--
-- TOC entry 4839 (class 1259 OID 52399)
-- Name: idx_notificacoes_data_criacao; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_data_criacao ON public.notificacoes USING btree (data_criacao DESC);


--
-- TOC entry 4840 (class 1259 OID 52400)
-- Name: idx_notificacoes_lida; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_lida ON public.notificacoes USING btree (lida);


--
-- TOC entry 4841 (class 1259 OID 52401)
-- Name: idx_notificacoes_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_tipo ON public.notificacoes USING btree (tipo);


--
-- TOC entry 4842 (class 1259 OID 52402)
-- Name: idx_notificacoes_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_usuario_id ON public.notificacoes USING btree (usuario_id);


--
-- TOC entry 4845 (class 1259 OID 52403)
-- Name: idx_pagamentos_id_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_estacionamento ON public.pagamentos USING btree (id_estacionamento);


--
-- TOC entry 4846 (class 1259 OID 52404)
-- Name: idx_pagamentos_id_reserva; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_reserva ON public.pagamentos USING btree (reserva_id);


--
-- TOC entry 4847 (class 1259 OID 52405)
-- Name: idx_pagamentos_id_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_usuario ON public.pagamentos USING btree (id_usuario);


--
-- TOC entry 4852 (class 1259 OID 52406)
-- Name: idx_pagamentos_pix_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_estacionamento ON public.pagamentos_pix USING btree (id_estacionamento);


--
-- TOC entry 4853 (class 1259 OID 52407)
-- Name: idx_pagamentos_pix_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_status ON public.pagamentos_pix USING btree (status);


--
-- TOC entry 4854 (class 1259 OID 52408)
-- Name: idx_pagamentos_pix_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_usuario ON public.pagamentos_pix USING btree (id_usuario);


--
-- TOC entry 4859 (class 1259 OID 52409)
-- Name: idx_reservas_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_estacionamento ON public.reservas USING btree (estacionamento_id);


--
-- TOC entry 4860 (class 1259 OID 52410)
-- Name: idx_reservas_id_pagamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_id_pagamento ON public.reservas USING btree (id_pagamento);


--
-- TOC entry 4861 (class 1259 OID 52411)
-- Name: idx_reservas_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_status ON public.reservas USING btree (status);


--
-- TOC entry 4862 (class 1259 OID 52412)
-- Name: idx_reservas_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_usuario ON public.reservas USING btree (usuario_id);


--
-- TOC entry 4867 (class 1259 OID 52413)
-- Name: idx_solicitacoes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_solicitacoes_status ON public.solicitacoes_estacionamento USING btree (status);


--
-- TOC entry 4868 (class 1259 OID 52414)
-- Name: idx_solicitacoes_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_solicitacoes_usuario ON public.solicitacoes_estacionamento USING btree (usuario_id);


--
-- TOC entry 4881 (class 1259 OID 52415)
-- Name: idx_vagas_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vagas_status ON public.vagas USING btree (estacionamento_id, status);


--
-- TOC entry 4886 (class 1259 OID 52416)
-- Name: idx_veiculos_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_veiculos_usuario_id ON public.veiculos USING btree (usuario_id);


--
-- TOC entry 4912 (class 2620 OID 52417)
-- Name: admins prevent_duplicate_email_admins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_duplicate_email_admins BEFORE INSERT OR UPDATE OF email ON public.admins FOR EACH ROW EXECUTE FUNCTION public.check_email_across_tables();


--
-- TOC entry 4918 (class 2620 OID 52418)
-- Name: usuarios prevent_duplicate_email_usuarios; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_duplicate_email_usuarios BEFORE INSERT OR UPDATE OF email ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.check_email_across_tables();


--
-- TOC entry 4913 (class 2620 OID 52419)
-- Name: estacionamento_pagamentos tr_estacionamento_pagamentos_atualizacao; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_estacionamento_pagamentos_atualizacao BEFORE UPDATE ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();


--
-- TOC entry 4914 (class 2620 OID 52420)
-- Name: estacionamento_pagamentos tr_limpar_chave_pix; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_limpar_chave_pix BEFORE DELETE ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.limpar_chave_pix();


--
-- TOC entry 4915 (class 2620 OID 52421)
-- Name: estacionamento_pagamentos tr_sincronizar_chave_pix_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_sincronizar_chave_pix_ins AFTER INSERT ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.sincronizar_chave_pix();


--
-- TOC entry 4916 (class 2620 OID 52422)
-- Name: estacionamento_pagamentos tr_sincronizar_chave_pix_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_sincronizar_chave_pix_upd AFTER UPDATE OF chave_pix ON public.estacionamento_pagamentos FOR EACH ROW WHEN (((old.chave_pix)::text IS DISTINCT FROM (new.chave_pix)::text)) EXECUTE FUNCTION public.sincronizar_chave_pix();


--
-- TOC entry 4917 (class 2620 OID 52423)
-- Name: horarios_funcionamento update_horarios_funcionamento_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_horarios_funcionamento_updated_at BEFORE UPDATE ON public.horarios_funcionamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4919 (class 2620 OID 52424)
-- Name: vagas update_vagas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_vagas_updated_at BEFORE UPDATE ON public.vagas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4891 (class 2606 OID 52425)
-- Name: estacionamentos estacionamentos_id_solicitacao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_id_solicitacao_fkey FOREIGN KEY (id_solicitacao) REFERENCES public.solicitacoes_estacionamento(id);


--
-- TOC entry 4893 (class 2606 OID 52430)
-- Name: estacionamento_pagamentos fk_estacionamento; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT fk_estacionamento FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4892 (class 2606 OID 52435)
-- Name: estacionamentos fk_estacionamentos_admins; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT fk_estacionamentos_admins FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- TOC entry 4899 (class 2606 OID 52440)
-- Name: pagamentos fk_reserva; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE CASCADE;


--
-- TOC entry 4894 (class 2606 OID 52445)
-- Name: horarios_funcionamento horarios_funcionamento_estacionamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_estacionamento_id_fkey FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4895 (class 2606 OID 52450)
-- Name: logs_veiculos logs_veiculos_estacionamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_estacionamento_id_fkey FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4896 (class 2606 OID 52455)
-- Name: logs_veiculos logs_veiculos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- TOC entry 4897 (class 2606 OID 52460)
-- Name: logs_veiculos logs_veiculos_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- TOC entry 4898 (class 2606 OID 52465)
-- Name: notificacoes notificacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4900 (class 2606 OID 52470)
-- Name: pagamentos pagamentos_id_estacionamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_estacionamento_fkey FOREIGN KEY (id_estacionamento) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4901 (class 2606 OID 52475)
-- Name: pagamentos pagamentos_id_reserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_reserva_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE CASCADE;


--
-- TOC entry 4902 (class 2606 OID 52480)
-- Name: pagamentos pagamentos_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4903 (class 2606 OID 52485)
-- Name: pagamentos_pix pagamentos_pix_id_estacionamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_estacionamento_fkey FOREIGN KEY (id_estacionamento) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4904 (class 2606 OID 52490)
-- Name: pagamentos_pix pagamentos_pix_id_reserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_reserva_fkey FOREIGN KEY (id_reserva) REFERENCES public.reservas(id) ON DELETE SET NULL;


--
-- TOC entry 4905 (class 2606 OID 52495)
-- Name: pagamentos_pix pagamentos_pix_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4906 (class 2606 OID 52500)
-- Name: reservas reservas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4907 (class 2606 OID 52505)
-- Name: reservas reservas_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE CASCADE;


--
-- TOC entry 4908 (class 2606 OID 52510)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_aprovado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES public.usuarios(id);


--
-- TOC entry 4909 (class 2606 OID 52515)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4910 (class 2606 OID 52520)
-- Name: vagas vagas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- TOC entry 4911 (class 2606 OID 52525)
-- Name: veiculos veiculos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


-- Completed on 2025-11-11 15:23:51

--
-- PostgreSQL database dump complete
--

\unrestrict gnydz5qIcvLaEb5h3ywbcUFOfdEKb8mlHjauF0tZwdAf1AoelmpoMXvApiYnDPN

