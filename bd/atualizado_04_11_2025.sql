--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-11-04 21:52:29

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
-- TOC entry 888 (class 1247 OID 17659)
-- Name: enum_usuarios_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.enum_usuarios_status AS ENUM (
    'ativo',
    'inativo',
    'suspenso'
);


ALTER TYPE public.enum_usuarios_status OWNER TO postgres;

--
-- TOC entry 891 (class 1247 OID 17666)
-- Name: enum_usuarios_tipo_usuario; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.enum_usuarios_tipo_usuario AS ENUM (
    'cliente',
    'admin',
    'funcionario'
);


ALTER TYPE public.enum_usuarios_tipo_usuario OWNER TO postgres;

--
-- TOC entry 894 (class 1247 OID 17674)
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
-- TOC entry 897 (class 1247 OID 17702)
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
-- TOC entry 249 (class 1255 OID 17721)
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
-- TOC entry 253 (class 1255 OID 34417)
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
-- TOC entry 250 (class 1255 OID 17722)
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
-- TOC entry 251 (class 1255 OID 17723)
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
-- TOC entry 252 (class 1255 OID 17724)
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
-- TOC entry 219 (class 1259 OID 17725)
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


ALTER TABLE public."SequelizeMeta" OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 17728)
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
    refresh_token_hash character varying(255)
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 17737)
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
-- TOC entry 5197 (class 0 OID 0)
-- Dependencies: 221
-- Name: admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admins_id_seq OWNED BY public.admins.id;


--
-- TOC entry 224 (class 1259 OID 17749)
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
    nome_titular_pix character varying(100)
);


ALTER TABLE public.estacionamentos OWNER TO postgres;

--
-- TOC entry 5198 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.latitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.latitude IS 'Latitude geográfica do estacionamento';


--
-- TOC entry 5199 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.longitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.longitude IS 'Longitude geográfica do estacionamento';


--
-- TOC entry 5200 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.vagas; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.vagas IS 'Número total de vagas do estacionamento';


--
-- TOC entry 5201 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.preco_hora; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.preco_hora IS 'Preço por hora do estacionamento';


--
-- TOC entry 5202 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.preco_dia; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.preco_dia IS 'Preço por dia do estacionamento';


--
-- TOC entry 5203 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.descricao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.descricao IS 'Descrição do estacionamento';


--
-- TOC entry 5204 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.foto; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.foto IS 'URL da foto do estacionamento';


--
-- TOC entry 5205 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.chave_pix IS 'Chave PIX do estacionamento (mantida em sincronia com estacionamento_pagamentos)';


--
-- TOC entry 5206 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.tipo_chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, telefone, email, aleatoria)';


--
-- TOC entry 5207 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN estacionamentos.nome_titular_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamentos.nome_titular_pix IS 'Nome do titular da conta PIX';


--
-- TOC entry 244 (class 1259 OID 18010)
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
-- TOC entry 222 (class 1259 OID 17738)
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
-- TOC entry 5208 (class 0 OID 0)
-- Dependencies: 222
-- Name: TABLE estacionamento_pagamentos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.estacionamento_pagamentos IS 'Armazena as configuraÃ§Ãµes de pagamento dos estacionamentos, incluindo chaves PIX e dados bancÃ¡rios';


--
-- TOC entry 5209 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.estacionamento_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.estacionamento_id IS 'ReferÃªncia ao estacionamento';


--
-- TOC entry 5210 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.tipo_chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.tipo_chave_pix IS 'Tipo da chave PIX (CPF, CNPJ, EMAIL, TELEFONE, ALEATORIA)';


--
-- TOC entry 5211 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.chave_pix; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.chave_pix IS 'Valor da chave PIX';


--
-- TOC entry 5212 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.nome_titular; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.nome_titular IS 'Nome do titular da conta';


--
-- TOC entry 5213 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.banco; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.banco IS 'Nome do banco (opcional)';


--
-- TOC entry 5214 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.tipo_conta; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.tipo_conta IS 'Tipo de conta bancÃ¡ria';


--
-- TOC entry 5215 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.agencia; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.agencia IS 'NÃºmero da agÃªncia (opcional)';


--
-- TOC entry 5216 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN estacionamento_pagamentos.conta; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estacionamento_pagamentos.conta IS 'NÃºmero da conta (opcional)';


--
-- TOC entry 223 (class 1259 OID 17748)
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
-- TOC entry 5217 (class 0 OID 0)
-- Dependencies: 223
-- Name: estacionamento_pagamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estacionamento_pagamentos_id_seq OWNED BY public.estacionamento_pagamentos.id;


--
-- TOC entry 225 (class 1259 OID 17759)
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
-- TOC entry 5218 (class 0 OID 0)
-- Dependencies: 225
-- Name: estacionamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.estacionamentos_id_seq OWNED BY public.estacionamentos.id;


--
-- TOC entry 226 (class 1259 OID 17760)
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
-- TOC entry 5219 (class 0 OID 0)
-- Dependencies: 226
-- Name: TABLE horarios_funcionamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.horarios_funcionamento IS 'Tabela de horários de funcionamento dos estacionamentos';


--
-- TOC entry 5220 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.id IS 'ID único do horário de funcionamento';


--
-- TOC entry 5221 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.estacionamento_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.estacionamento_id IS 'ID do estacionamento';


--
-- TOC entry 5222 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.dia_semana; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.dia_semana IS 'Dia da semana (0=Domingo, 1=Segunda, ..., 6=Sábado)';


--
-- TOC entry 5223 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.aberto; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.aberto IS 'Se o estacionamento está aberto neste dia';


--
-- TOC entry 5224 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.horario_abertura; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.horario_abertura IS 'Horário de abertura (HH:MM:SS)';


--
-- TOC entry 5225 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.horario_fechamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.horario_fechamento IS 'Horário de fechamento (HH:MM:SS)';


--
-- TOC entry 5226 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.created_at IS 'Data de criação do registro';


--
-- TOC entry 5227 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN horarios_funcionamento.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.horarios_funcionamento.updated_at IS 'Data da última atualização do registro';


--
-- TOC entry 227 (class 1259 OID 17767)
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
-- TOC entry 5228 (class 0 OID 0)
-- Dependencies: 227
-- Name: horarios_funcionamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.horarios_funcionamento_id_seq OWNED BY public.horarios_funcionamento.id;


--
-- TOC entry 228 (class 1259 OID 17768)
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
-- TOC entry 229 (class 1259 OID 17774)
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
-- TOC entry 5229 (class 0 OID 0)
-- Dependencies: 229
-- Name: logs_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.logs_admins_id_seq OWNED BY public.logs_admins.id;


--
-- TOC entry 230 (class 1259 OID 17775)
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
    CONSTRAINT logs_veiculos_tipo_operacao_check CHECK (((tipo_operacao)::text = ANY (ARRAY[('entrada'::character varying)::text, ('saida'::character varying)::text, ('reserva'::character varying)::text, ('cancelamento'::character varying)::text])))
);


ALTER TABLE public.logs_veiculos OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17782)
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
-- TOC entry 5230 (class 0 OID 0)
-- Dependencies: 231
-- Name: logs_veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.logs_veiculos_id_seq OWNED BY public.logs_veiculos.id;


--
-- TOC entry 248 (class 1259 OID 34430)
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
-- TOC entry 5231 (class 0 OID 0)
-- Dependencies: 248
-- Name: TABLE notificacoes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.notificacoes IS 'Tabela para armazenar notificaÃ§Ãµes do sistema';


--
-- TOC entry 5232 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.usuario_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.usuario_id IS 'ID do usuÃ¡rio que receberÃ¡ a notificaÃ§Ã£o';


--
-- TOC entry 5233 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.tipo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.tipo IS 'Tipo da notificaÃ§Ã£o (pix_copiado, pix_visualizado, pagamento_confirmado, etc)';


--
-- TOC entry 5234 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.titulo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.titulo IS 'TÃ­tulo da notificaÃ§Ã£o';


--
-- TOC entry 5235 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.mensagem; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.mensagem IS 'Mensagem/corpo da notificaÃ§Ã£o';


--
-- TOC entry 5236 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.dados; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.dados IS 'Dados adicionais em formato JSON';


--
-- TOC entry 5237 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.lida; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.lida IS 'Se a notificaÃ§Ã£o foi lida ou nÃ£o';


--
-- TOC entry 5238 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.data_criacao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.data_criacao IS 'Data e hora de criaÃ§Ã£o da notificaÃ§Ã£o';


--
-- TOC entry 5239 (class 0 OID 0)
-- Dependencies: 248
-- Name: COLUMN notificacoes.data_leitura; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.notificacoes.data_leitura IS 'Data e hora em que a notificaÃ§Ã£o foi lida';


--
-- TOC entry 247 (class 1259 OID 34429)
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
-- TOC entry 5240 (class 0 OID 0)
-- Dependencies: 247
-- Name: notificacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.notificacoes_id_seq OWNED BY public.notificacoes.id;


--
-- TOC entry 232 (class 1259 OID 17783)
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
    gateway character varying(50) DEFAULT 'pagarme'::character varying NOT NULL,
    parcelas integer DEFAULT 1,
    status public.pagamento_status NOT NULL
);


ALTER TABLE public.pagamentos OWNER TO postgres;

--
-- TOC entry 5241 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.metodo_pagamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.metodo_pagamento IS 'MÃ©todo de pagamento (ex: credit_card, boleto, pix)';


--
-- TOC entry 5242 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.codigo_transacao; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.codigo_transacao IS 'CÃ³digo da transaÃ§Ã£o no gateway de pagamento';


--
-- TOC entry 5243 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.dados_retorno; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.dados_retorno IS 'Dados adicionais retornados pelo gateway de pagamento';


--
-- TOC entry 5244 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.data_pagamento; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.data_pagamento IS 'Data em que o pagamento foi confirmado pelo gateway';


--
-- TOC entry 5245 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.gateway; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.gateway IS 'Nome do gateway de pagamento usado (ex: pagarme, mercadopago)';


--
-- TOC entry 5246 (class 0 OID 0)
-- Dependencies: 232
-- Name: COLUMN pagamentos.parcelas; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.parcelas IS 'NÃºmero de parcelas do pagamento';


--
-- TOC entry 233 (class 1259 OID 17792)
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
-- TOC entry 5247 (class 0 OID 0)
-- Dependencies: 233
-- Name: pagamentos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagamentos_id_seq OWNED BY public.pagamentos.id;


--
-- TOC entry 234 (class 1259 OID 17793)
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
-- TOC entry 235 (class 1259 OID 17801)
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
-- TOC entry 5248 (class 0 OID 0)
-- Dependencies: 235
-- Name: pagamentos_pix_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pagamentos_pix_id_seq OWNED BY public.pagamentos_pix.id;


--
-- TOC entry 236 (class 1259 OID 17802)
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
    CONSTRAINT reservas_status_check CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'pendente_pagamento'::character varying, 'confirmada'::character varying, 'ativa'::character varying, 'em_andamento'::character varying, 'concluida'::character varying, 'finalizada'::character varying, 'cancelada'::character varying, 'expirada'::character varying, 'nao_compareceu'::character varying, 'pagamento_aprovado'::character varying, 'pagamento_recusado'::character varying])::text[])))
);


ALTER TABLE public.reservas OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17813)
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
-- TOC entry 5249 (class 0 OID 0)
-- Dependencies: 237
-- Name: reservas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reservas_id_seq OWNED BY public.reservas.id;


--
-- TOC entry 238 (class 1259 OID 17814)
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
-- TOC entry 239 (class 1259 OID 17823)
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
-- TOC entry 5250 (class 0 OID 0)
-- Dependencies: 239
-- Name: solicitacoes_estacionamento_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.solicitacoes_estacionamento_id_seq OWNED BY public.solicitacoes_estacionamento.id;


--
-- TOC entry 240 (class 1259 OID 17824)
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
-- TOC entry 241 (class 1259 OID 17830)
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
-- TOC entry 5251 (class 0 OID 0)
-- Dependencies: 241
-- Name: tipos_veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.tipos_veiculos_id_seq OWNED BY public.tipos_veiculos.id;


--
-- TOC entry 217 (class 1259 OID 17543)
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
-- TOC entry 5252 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN usuarios.tipo_veiculo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.tipo_veiculo IS 'Tipo de veículo do usuário (ex: carro, moto, etc.)';


--
-- TOC entry 5253 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN usuarios.placa_veiculo; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.placa_veiculo IS 'Placa do veículo do usuário';


--
-- TOC entry 5254 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN usuarios.refresh_token_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.refresh_token_hash IS 'Hash do refresh token JWT para invalidar tokens';


--
-- TOC entry 5255 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN usuarios.foto_perfil; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.usuarios.foto_perfil IS 'URL da foto de perfil do usuário';


--
-- TOC entry 242 (class 1259 OID 17831)
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
-- TOC entry 5256 (class 0 OID 0)
-- Dependencies: 242
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- TOC entry 218 (class 1259 OID 17552)
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
-- TOC entry 243 (class 1259 OID 17832)
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
-- TOC entry 5257 (class 0 OID 0)
-- Dependencies: 243
-- Name: vagas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vagas_id_seq OWNED BY public.vagas.id;


--
-- TOC entry 246 (class 1259 OID 18015)
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
-- TOC entry 245 (class 1259 OID 18014)
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
-- TOC entry 5258 (class 0 OID 0)
-- Dependencies: 245
-- Name: veiculos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.veiculos_id_seq OWNED BY public.veiculos.id;


--
-- TOC entry 4846 (class 2604 OID 18033)
-- Name: admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins ALTER COLUMN id SET DEFAULT nextval('public.admins_id_seq'::regclass);


--
-- TOC entry 4851 (class 2604 OID 18034)
-- Name: estacionamento_pagamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos ALTER COLUMN id SET DEFAULT nextval('public.estacionamento_pagamentos_id_seq'::regclass);


--
-- TOC entry 4855 (class 2604 OID 18035)
-- Name: estacionamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos ALTER COLUMN id SET DEFAULT nextval('public.estacionamentos_id_seq'::regclass);


--
-- TOC entry 4861 (class 2604 OID 18036)
-- Name: horarios_funcionamento id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento ALTER COLUMN id SET DEFAULT nextval('public.horarios_funcionamento_id_seq'::regclass);


--
-- TOC entry 4865 (class 2604 OID 18037)
-- Name: logs_admins id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_admins ALTER COLUMN id SET DEFAULT nextval('public.logs_admins_id_seq'::regclass);


--
-- TOC entry 4867 (class 2604 OID 18038)
-- Name: logs_veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos ALTER COLUMN id SET DEFAULT nextval('public.logs_veiculos_id_seq'::regclass);


--
-- TOC entry 4895 (class 2604 OID 34433)
-- Name: notificacoes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes ALTER COLUMN id SET DEFAULT nextval('public.notificacoes_id_seq'::regclass);


--
-- TOC entry 4869 (class 2604 OID 18039)
-- Name: pagamentos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos ALTER COLUMN id SET DEFAULT nextval('public.pagamentos_id_seq'::regclass);


--
-- TOC entry 4874 (class 2604 OID 18040)
-- Name: pagamentos_pix id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix ALTER COLUMN id SET DEFAULT nextval('public.pagamentos_pix_id_seq'::regclass);


--
-- TOC entry 4878 (class 2604 OID 18041)
-- Name: reservas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas ALTER COLUMN id SET DEFAULT nextval('public.reservas_id_seq'::regclass);


--
-- TOC entry 4884 (class 2604 OID 18042)
-- Name: solicitacoes_estacionamento id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento ALTER COLUMN id SET DEFAULT nextval('public.solicitacoes_estacionamento_id_seq'::regclass);


--
-- TOC entry 4889 (class 2604 OID 18043)
-- Name: tipos_veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_veiculos ALTER COLUMN id SET DEFAULT nextval('public.tipos_veiculos_id_seq'::regclass);


--
-- TOC entry 4837 (class 2604 OID 18044)
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- TOC entry 4841 (class 2604 OID 18045)
-- Name: vagas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas ALTER COLUMN id SET DEFAULT nextval('public.vagas_id_seq'::regclass);


--
-- TOC entry 4891 (class 2604 OID 18018)
-- Name: veiculos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos ALTER COLUMN id SET DEFAULT nextval('public.veiculos_id_seq'::regclass);


--
-- TOC entry 5163 (class 0 OID 17725)
-- Dependencies: 219
-- Data for Name: SequelizeMeta; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SequelizeMeta" (name) FROM stdin;
20250612115311-add_payment_gateway_columns.js
\.


--
-- TOC entry 5164 (class 0 OID 17728)
-- Dependencies: 220
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admins (id, nome, email, senha, nivel_acesso, status, ultimo_acesso, reset_token, reset_token_expires, created_at, updated_at, refresh_token_hash) FROM stdin;
2	Alisson Santos	alimiguel1098@hotmail.com	$2b$12$98TYwC7hnBkCXhcZBEM0F.gw1aqzQjOlPBmk8wyUwr4caapQ4OoeC	estacionamento	ativo	\N	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03	$2b$10$XuGZMYP9Ciz2vV6EkjUHsu6F0eG6YDMBEzxtG4QYRDbtWjALafWAa
\.


--
-- TOC entry 5166 (class 0 OID 17738)
-- Dependencies: 222
-- Data for Name: estacionamento_pagamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estacionamento_pagamentos (id, estacionamento_id, tipo_chave_pix, chave_pix, nome_titular, banco, tipo_conta, agencia, conta, data_criacao, data_atualizacao, data_exclusao) FROM stdin;
\.


--
-- TOC entry 5168 (class 0 OID 17749)
-- Dependencies: 224
-- Data for Name: estacionamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.estacionamentos (id, nome, cnpj, endereco, telefone, email, capacidade_total, vagas_disponiveis, valor_hora, valor_diaria, valor_mensal, horario_abertura, horario_fechamento, status, data_cadastro, latitude, longitude, vagas, preco_hora, preco_dia, descricao, foto, admin_id, chave_pix_cnpj, id_solicitacao, chave_pix, tipo_chave_pix, nome_titular_pix) FROM stdin;
1	Silcar Estacionamento LTDA	19867505000186	Rua Major Oliveira Borges, 307 | Bairro: Centro | Lorena - SP | CEP: 12600-020	12991743827	alimiguel1098@hotmail.com	150	150	5.00	30.00	600.00	08:00:00	20:00:00	ativo	2025-10-28 21:54:54.828542-03	-22.73220327	-45.12032143	150	5.00	30.00	Estacionamento parceiro ParkNow	\N	2	\N	\N	19867505000186	cnpj	Silcar Estacionamento LTDA
\.


--
-- TOC entry 5170 (class 0 OID 17760)
-- Dependencies: 226
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
-- TOC entry 5172 (class 0 OID 17768)
-- Dependencies: 228
-- Data for Name: logs_admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.logs_admins (id, admin_id, acao, tabela_afetada, registro_id, valores_antigos, valores_novos, ip_address, user_agent, created_at) FROM stdin;
1	6	Ajustou vagas Est. 5 para 50 (Add: 0, Rem: 0)	\N	\N	\N	\N	::1	\N	2025-06-23 12:07:32.859619-03
2	6	Ajustou vagas Est. 5 para 50 (Add: 0, Rem: 0)	\N	\N	\N	\N	::1	\N	2025-06-23 12:07:50.58655-03
\.


--
-- TOC entry 5174 (class 0 OID 17775)
-- Dependencies: 230
-- Data for Name: logs_veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.logs_veiculos (id, vaga_id, estacionamento_id, usuario_id, tipo_operacao, placa_veiculo, data_hora, detalhes) FROM stdin;
\.


--
-- TOC entry 5191 (class 0 OID 34430)
-- Dependencies: 248
-- Data for Name: notificacoes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notificacoes (id, usuario_id, tipo, titulo, mensagem, dados, lida, data_criacao, data_leitura, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5176 (class 0 OID 17783)
-- Dependencies: 232
-- Data for Name: pagamentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagamentos (id, reserva_id, id_estacionamento, id_usuario, valor, metodo_pagamento, codigo_transacao, dados_retorno, data_pagamento, created_at, updated_at, deleted_at, gateway, parcelas, status) FROM stdin;
15	41	1	5	NaN	pix	\N	{"txid": "PARKNOW1762302076900594", "valor": null, "qr_code": "data:image/png;base64,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", "chave_pix": "19867505000186", "descricao": "Estacionamento Silcar Estacionamento LTDA - Reserva #41", "expira_em": "2025-11-05T00:51:17.075Z", "reserva_id": 41, "data_criacao": "2025-11-05T00:21:17.079Z", "nome_titular": "Silcar Estacionamento LTDA", "qr_code_text": "00020126360014BR.GOV.BCB.PIX0114198675050001865204000053039865403NaN5802BR5926Silcar Estacionamento LTDA6009SAO PAULO62270523PARKNOW1762302076900594630495E3", "tipo_chave_pix": "cnpj", "valor_pagamento": null, "metodo_pagamento": "pix", "status_pagamento": "pendente"}	\N	2025-11-04 21:21:16.706136	2025-11-04 21:21:16.706136	\N	pagarme	1	pendente
16	42	1	5	NaN	pix	\N	{"txid": "PARKNOW176230298175050", "valor": null, "qr_code": "data:image/png;base64,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", "chave_pix": "19867505000186", "descricao": "Estacionamento Silcar Estacionamento LTDA - Reserva #42", "expira_em": "2025-11-05T01:06:21.880Z", "reserva_id": 42, "data_criacao": "2025-11-05T00:36:21.881Z", "nome_titular": "Silcar Estacionamento LTDA", "qr_code_text": "00020126360014BR.GOV.BCB.PIX0114198675050001865204000053039865403NaN5802BR5925SILCAR ESTACIONAMENTO LTD6009SAO PAULO62260522PARKNOW17623029817505063048FC4", "tipo_chave_pix": "cnpj", "valor_pagamento": null, "metodo_pagamento": "pix", "status_pagamento": "pendente"}	\N	2025-11-04 21:36:21.531054	2025-11-04 21:36:21.531054	\N	pagarme	1	pendente
17	43	1	5	NaN	pix	\N	{"txid": "PARKNOW176230330215713", "valor": null, "qr_code": "data:image/png;base64,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", "chave_pix": "19867505000186", "descricao": "Estacionamento Silcar Estacionamento LTDA - Reserva #43", "expira_em": "2025-11-05T01:11:42.360Z", "reserva_id": 43, "data_criacao": "2025-11-05T00:41:42.366Z", "nome_titular": "Silcar Estacionamento LTDA", "qr_code_text": "00020126360014BR.GOV.BCB.PIX0114198675050001865204000053039865403NaN5802BR5925SILCAR ESTACIONAMENTO LTD6009SAO PAULO62260522PARKNOW17623033021571363046F1B", "tipo_chave_pix": "cnpj", "valor_pagamento": null, "metodo_pagamento": "pix", "status_pagamento": "pendente"}	\N	2025-11-04 21:41:41.945552	2025-11-04 21:41:41.945552	\N	pagarme	1	pendente
18	44	1	5	NaN	pix	\N	{"txid": "PARKNOW1762303461818139", "valor": null, "qr_code": "data:image/png;base64,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", "chave_pix": "19867505000186", "descricao": "Estacionamento Silcar Estacionamento LTDA - Reserva #44", "expira_em": "2025-11-05T01:14:21.946Z", "reserva_id": 44, "data_criacao": "2025-11-05T00:44:21.947Z", "nome_titular": "Silcar Estacionamento LTDA", "qr_code_text": "00020126360014BR.GOV.BCB.PIX0114198675050001865204000053039865403NaN5802BR5925SILCAR ESTACIONAMENTO LTD6009SAO PAULO62270523PARKNOW17623034618181396304188B", "tipo_chave_pix": "cnpj", "valor_pagamento": null, "metodo_pagamento": "pix", "status_pagamento": "pendente"}	\N	2025-11-04 21:44:21.668816	2025-11-04 21:44:21.668816	\N	pagarme	1	pendente
19	45	1	5	NaN	pix	\N	{"txid": "PARKNOW1762303585646513", "valor": null, "qr_code": "data:image/png;base64,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", "chave_pix": "19867505000186", "descricao": "Estacionamento Silcar Estacionamento LTDA - Reserva #45", "expira_em": "2025-11-05T01:16:25.779Z", "reserva_id": 45, "data_criacao": "2025-11-05T00:46:25.780Z", "nome_titular": "Silcar Estacionamento LTDA", "qr_code_text": "00020126360014BR.GOV.BCB.PIX0114198675050001865204000053039865403NaN5802BR5925SILCAR ESTACIONAMENTO LTD6009SAO PAULO62270523PARKNOW17623035856465136304C038", "tipo_chave_pix": "cnpj", "valor_pagamento": null, "metodo_pagamento": "pix", "status_pagamento": "pendente"}	\N	2025-11-04 21:46:25.49158	2025-11-04 21:46:25.49158	\N	pagarme	1	pendente
\.


--
-- TOC entry 5178 (class 0 OID 17793)
-- Dependencies: 234
-- Data for Name: pagamentos_pix; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pagamentos_pix (id, id_reserva, id_estacionamento, id_usuario, valor, chave_pix_destinatario, status, qr_code, qr_code_base64, codigo_copia_cola, data_expiracao, data_pagamento, dados_retorno, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- TOC entry 5180 (class 0 OID 17802)
-- Dependencies: 236
-- Data for Name: reservas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reservas (id, usuario_id, vaga_id, estacionamento_id, data_reserva, data_entrada_prevista, data_saida_prevista, data_entrada_real, data_saida_real, status, valor_total, forma_pagamento, status_pagamento, codigo_reserva, created_at, updated_at, placa_veiculo, data_criacao, id_pagamento) FROM stdin;
41	5	15	1	2025-11-04 21:21:16.71	2025-11-05 00:31:00	2025-11-05 01:31:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-04 21:21:16.71	2025-11-04 21:31:46.928838	KZT2530	2025-11-04 21:21:16.706136	15
42	5	11	1	2025-11-04 21:36:21.533	2025-11-05 00:46:00	2025-11-05 01:46:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-04 21:36:21.533	2025-11-04 21:41:30.790214	KZT2530	2025-11-04 21:36:21.531054	16
43	5	11	1	2025-11-04 21:41:41.938	2025-11-05 00:51:00	2025-11-05 01:51:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-04 21:41:41.938	2025-11-04 21:44:12.52844	KZT2530	2025-11-04 21:41:41.945552	17
44	5	11	1	2025-11-04 21:44:21.672	2025-11-05 00:54:00	2025-11-05 01:54:00	\N	\N	cancelada	10.00	\N	pendente	\N	2025-11-04 21:44:21.672	2025-11-04 21:46:13.878183	KZT2530	2025-11-04 21:44:21.668816	18
45	5	13	1	2025-11-04 21:46:25.495	2025-11-05 00:56:00	2025-11-05 01:56:00	\N	\N	pendente	10.00	\N	pendente	\N	2025-11-04 21:46:25.495	2025-11-04 21:46:25.49158	KZT2530	2025-11-04 21:46:25.49158	19
\.


--
-- TOC entry 5182 (class 0 OID 17814)
-- Dependencies: 238
-- Data for Name: solicitacoes_estacionamento; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.solicitacoes_estacionamento (id, usuario_id, cnpj, razao_social, nome_fantasia, chave_pix_cnpj, endereco, telefone, email_contato, status, motivo_rejeicao, data_solicitacao, data_aprovacao, aprovado_por, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- TOC entry 5184 (class 0 OID 17824)
-- Dependencies: 240
-- Data for Name: tipos_veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tipos_veiculos (id, nome, descricao, fator_preco) FROM stdin;
\.


--
-- TOC entry 5161 (class 0 OID 17543)
-- Dependencies: 217
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usuarios (id, nome, email, cpf, telefone, senha, tipo_usuario, status, data_cadastro, ultimo_acesso, reset_token, reset_token_expires, email_verified_at, tipo_veiculo, placa_veiculo, refresh_token_hash, foto_perfil) FROM stdin;
5	Alisson Santos	alimiguel1098@gmail.com	48977085837	12991743827	$argon2id$v=19$m=65536,t=3,p=4$V6NS4iNjirnnnnooo6xKag$p1Ne/W0YH7EyXb0ew6JZ5pOxOIQwzXRWVQcLFYu5Ev4	cliente	ativo	2025-10-28 20:47:42.621263	\N	\N	\N	\N	Carro	KZT2530	$2b$10$aiGa.i1KJ4mMXI6qx.Ebcu1YbVYSi8ncbJwNdFWQeszIC4wSYJTQO	\N
\.


--
-- TOC entry 5162 (class 0 OID 17552)
-- Dependencies: 218
-- Data for Name: vagas; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.vagas (id, numero, estacionamento_id, status, placa, tipo_veiculo, entrada, tempo_estacionado, usuario_id, reserva_id_ativa, created_at, updated_at) FROM stdin;
1	1	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
2	2	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
3	3	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
4	4	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
5	5	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
6	6	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
7	7	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
8	8	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
9	9	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
10	10	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
12	12	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
13	13	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
14	14	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
16	16	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
17	17	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
18	18	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
19	19	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
20	20	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
21	21	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
22	22	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
23	23	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
24	24	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
25	25	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
26	26	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
27	27	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
28	28	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
29	29	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
30	30	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
31	31	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
32	32	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
33	33	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
34	34	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
35	35	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
36	36	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
37	37	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
38	38	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
39	39	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
40	40	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
41	41	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
42	42	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
43	43	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
44	44	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
45	45	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
46	46	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
47	47	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
48	48	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
49	49	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
50	50	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
51	51	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
52	52	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
53	53	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
54	54	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
55	55	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
56	56	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
57	57	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
58	58	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
59	59	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
60	60	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
61	61	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
62	62	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
63	63	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
64	64	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
65	65	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
66	66	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
67	67	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
68	68	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
69	69	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
70	70	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
71	71	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
72	72	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
73	73	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
74	74	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
75	75	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
76	76	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
77	77	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
78	78	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
79	79	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
80	80	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
81	81	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
82	82	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
83	83	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
84	84	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
85	85	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
86	86	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
87	87	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
88	88	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
89	89	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
90	90	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
91	91	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
92	92	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
93	93	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
94	94	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
95	95	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
96	96	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
97	97	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
11	11	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-11-04 21:46:13.878183-03
98	98	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
99	99	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
100	100	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
101	101	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
102	102	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
103	103	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
104	104	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
105	105	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
106	106	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
107	107	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
108	108	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
109	109	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
110	110	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
111	111	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
112	112	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
113	113	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
114	114	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
115	115	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
116	116	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
117	117	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
118	118	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
119	119	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
120	120	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
121	121	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
122	122	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
123	123	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
124	124	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
125	125	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
126	126	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
127	127	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
128	128	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
129	129	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
130	130	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
131	131	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
132	132	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
133	133	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
134	134	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
135	135	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
136	136	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
137	137	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
138	138	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
139	139	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
140	140	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
141	141	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
142	142	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
143	143	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
144	144	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
145	145	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
146	146	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
147	147	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
148	148	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
149	149	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
150	150	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-10-28 21:54:54.828542-03
15	15	1	livre	\N	padrao	\N	0	\N	\N	2025-10-28 21:54:54.828542-03	2025-11-04 21:31:46.928838-03
\.


--
-- TOC entry 5189 (class 0 OID 18015)
-- Dependencies: 246
-- Data for Name: veiculos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.veiculos (id, usuario_id, tipo_veiculo, placa_veiculo, padrao, data_cadastro, data_atualizacao) FROM stdin;
2	5	Carro	KZT2530	t	2025-10-29 20:30:25.701188-03	2025-10-29 20:30:25.701188-03
\.


--
-- TOC entry 5259 (class 0 OID 0)
-- Dependencies: 221
-- Name: admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.admins_id_seq', 2, true);


--
-- TOC entry 5260 (class 0 OID 0)
-- Dependencies: 223
-- Name: estacionamento_pagamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estacionamento_pagamentos_id_seq', 1, false);


--
-- TOC entry 5261 (class 0 OID 0)
-- Dependencies: 225
-- Name: estacionamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.estacionamentos_id_seq', 1, true);


--
-- TOC entry 5262 (class 0 OID 0)
-- Dependencies: 227
-- Name: horarios_funcionamento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.horarios_funcionamento_id_seq', 7, true);


--
-- TOC entry 5263 (class 0 OID 0)
-- Dependencies: 229
-- Name: logs_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.logs_admins_id_seq', 1, false);


--
-- TOC entry 5264 (class 0 OID 0)
-- Dependencies: 231
-- Name: logs_veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.logs_veiculos_id_seq', 1, false);


--
-- TOC entry 5265 (class 0 OID 0)
-- Dependencies: 247
-- Name: notificacoes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.notificacoes_id_seq', 1, false);


--
-- TOC entry 5266 (class 0 OID 0)
-- Dependencies: 233
-- Name: pagamentos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagamentos_id_seq', 19, true);


--
-- TOC entry 5267 (class 0 OID 0)
-- Dependencies: 235
-- Name: pagamentos_pix_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pagamentos_pix_id_seq', 1, false);


--
-- TOC entry 5268 (class 0 OID 0)
-- Dependencies: 237
-- Name: reservas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reservas_id_seq', 45, true);


--
-- TOC entry 5269 (class 0 OID 0)
-- Dependencies: 239
-- Name: solicitacoes_estacionamento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.solicitacoes_estacionamento_id_seq', 1, false);


--
-- TOC entry 5270 (class 0 OID 0)
-- Dependencies: 241
-- Name: tipos_veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.tipos_veiculos_id_seq', 1, false);


--
-- TOC entry 5271 (class 0 OID 0)
-- Dependencies: 242
-- Name: usuarios_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.usuarios_id_seq', 5, true);


--
-- TOC entry 5272 (class 0 OID 0)
-- Dependencies: 243
-- Name: vagas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.vagas_id_seq', 150, true);


--
-- TOC entry 5273 (class 0 OID 0)
-- Dependencies: 245
-- Name: veiculos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.veiculos_id_seq', 2, true);


--
-- TOC entry 4918 (class 2606 OID 17847)
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- TOC entry 4920 (class 2606 OID 17849)
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- TOC entry 4922 (class 2606 OID 17851)
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- TOC entry 4925 (class 2606 OID 17853)
-- Name: estacionamento_pagamentos estacionamento_pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT estacionamento_pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4931 (class 2606 OID 17855)
-- Name: estacionamentos estacionamentos_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 4933 (class 2606 OID 17857)
-- Name: estacionamentos estacionamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4936 (class 2606 OID 17859)
-- Name: horarios_funcionamento horarios_funcionamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_pkey PRIMARY KEY (id);


--
-- TOC entry 4941 (class 2606 OID 17861)
-- Name: logs_admins logs_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_admins
    ADD CONSTRAINT logs_admins_pkey PRIMARY KEY (id);


--
-- TOC entry 4944 (class 2606 OID 17863)
-- Name: logs_veiculos logs_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4985 (class 2606 OID 34441)
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);


--
-- TOC entry 4949 (class 2606 OID 17865)
-- Name: pagamentos pagamentos_codigo_transacao_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_codigo_transacao_key UNIQUE (codigo_transacao);


--
-- TOC entry 4956 (class 2606 OID 17867)
-- Name: pagamentos_pix pagamentos_pix_codigo_copia_cola_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_codigo_copia_cola_key UNIQUE (codigo_copia_cola);


--
-- TOC entry 4958 (class 2606 OID 17869)
-- Name: pagamentos_pix pagamentos_pix_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_pkey PRIMARY KEY (id);


--
-- TOC entry 4951 (class 2606 OID 17871)
-- Name: pagamentos pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 4964 (class 2606 OID 17873)
-- Name: reservas reservas_codigo_reserva_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_codigo_reserva_key UNIQUE (codigo_reserva);


--
-- TOC entry 4966 (class 2606 OID 17875)
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- TOC entry 4970 (class 2606 OID 17877)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_cnpj_key UNIQUE (cnpj);


--
-- TOC entry 4972 (class 2606 OID 17879)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_pkey PRIMARY KEY (id);


--
-- TOC entry 4974 (class 2606 OID 17881)
-- Name: tipos_veiculos tipos_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tipos_veiculos
    ADD CONSTRAINT tipos_veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4929 (class 2606 OID 17883)
-- Name: estacionamento_pagamentos uk_estacionamento_pagamento; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT uk_estacionamento_pagamento UNIQUE (estacionamento_id);


--
-- TOC entry 4938 (class 2606 OID 17885)
-- Name: horarios_funcionamento unq_estacionamento_dia; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT unq_estacionamento_dia UNIQUE (estacionamento_id, dia_semana);


--
-- TOC entry 4907 (class 2606 OID 17887)
-- Name: usuarios usuarios_cpf_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_cpf_key UNIQUE (cpf);


--
-- TOC entry 4909 (class 2606 OID 17889)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 4911 (class 2606 OID 17590)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 4914 (class 2606 OID 17891)
-- Name: vagas vagas_estacionamento_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_estacionamento_id_numero_key UNIQUE (estacionamento_id, numero);


--
-- TOC entry 4916 (class 2606 OID 17594)
-- Name: vagas vagas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_pkey PRIMARY KEY (id);


--
-- TOC entry 4977 (class 2606 OID 18023)
-- Name: veiculos veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_pkey PRIMARY KEY (id);


--
-- TOC entry 4979 (class 2606 OID 18025)
-- Name: veiculos veiculos_usuario_id_placa_veiculo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_usuario_id_placa_veiculo_key UNIQUE (usuario_id, placa_veiculo);


--
-- TOC entry 4923 (class 1259 OID 17892)
-- Name: idx_admins_refresh_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admins_refresh_token ON public.admins USING btree (refresh_token_hash);


--
-- TOC entry 4926 (class 1259 OID 17893)
-- Name: idx_estacionamento_pagamentos_chave_pix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamento_pagamentos_chave_pix ON public.estacionamento_pagamentos USING btree (chave_pix);


--
-- TOC entry 4927 (class 1259 OID 17894)
-- Name: idx_estacionamento_pagamentos_estacionamento_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamento_pagamentos_estacionamento_id ON public.estacionamento_pagamentos USING btree (estacionamento_id);


--
-- TOC entry 4934 (class 1259 OID 17895)
-- Name: idx_estacionamentos_chave_pix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estacionamentos_chave_pix ON public.estacionamentos USING btree (chave_pix);


--
-- TOC entry 4939 (class 1259 OID 17896)
-- Name: idx_logs_admins_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_admins_created ON public.logs_admins USING btree (created_at);


--
-- TOC entry 4942 (class 1259 OID 17897)
-- Name: idx_logs_veiculos_data; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_logs_veiculos_data ON public.logs_veiculos USING btree (data_hora);


--
-- TOC entry 4980 (class 1259 OID 34449)
-- Name: idx_notificacoes_data_criacao; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_data_criacao ON public.notificacoes USING btree (data_criacao DESC);


--
-- TOC entry 4981 (class 1259 OID 34448)
-- Name: idx_notificacoes_lida; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_lida ON public.notificacoes USING btree (lida);


--
-- TOC entry 4982 (class 1259 OID 34450)
-- Name: idx_notificacoes_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_tipo ON public.notificacoes USING btree (tipo);


--
-- TOC entry 4983 (class 1259 OID 34447)
-- Name: idx_notificacoes_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notificacoes_usuario_id ON public.notificacoes USING btree (usuario_id);


--
-- TOC entry 4945 (class 1259 OID 17898)
-- Name: idx_pagamentos_id_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_estacionamento ON public.pagamentos USING btree (id_estacionamento);


--
-- TOC entry 4946 (class 1259 OID 17899)
-- Name: idx_pagamentos_id_reserva; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_reserva ON public.pagamentos USING btree (reserva_id);


--
-- TOC entry 4947 (class 1259 OID 17900)
-- Name: idx_pagamentos_id_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_id_usuario ON public.pagamentos USING btree (id_usuario);


--
-- TOC entry 4952 (class 1259 OID 17901)
-- Name: idx_pagamentos_pix_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_estacionamento ON public.pagamentos_pix USING btree (id_estacionamento);


--
-- TOC entry 4953 (class 1259 OID 17902)
-- Name: idx_pagamentos_pix_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_status ON public.pagamentos_pix USING btree (status);


--
-- TOC entry 4954 (class 1259 OID 17903)
-- Name: idx_pagamentos_pix_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_pix_usuario ON public.pagamentos_pix USING btree (id_usuario);


--
-- TOC entry 4959 (class 1259 OID 17904)
-- Name: idx_reservas_estacionamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_estacionamento ON public.reservas USING btree (estacionamento_id);


--
-- TOC entry 4960 (class 1259 OID 18032)
-- Name: idx_reservas_id_pagamento; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_id_pagamento ON public.reservas USING btree (id_pagamento);


--
-- TOC entry 4961 (class 1259 OID 17905)
-- Name: idx_reservas_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_status ON public.reservas USING btree (status);


--
-- TOC entry 4962 (class 1259 OID 17906)
-- Name: idx_reservas_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reservas_usuario ON public.reservas USING btree (usuario_id);


--
-- TOC entry 4967 (class 1259 OID 17907)
-- Name: idx_solicitacoes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_solicitacoes_status ON public.solicitacoes_estacionamento USING btree (status);


--
-- TOC entry 4968 (class 1259 OID 17908)
-- Name: idx_solicitacoes_usuario; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_solicitacoes_usuario ON public.solicitacoes_estacionamento USING btree (usuario_id);


--
-- TOC entry 4912 (class 1259 OID 17909)
-- Name: idx_vagas_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_vagas_status ON public.vagas USING btree (estacionamento_id, status);


--
-- TOC entry 4975 (class 1259 OID 18031)
-- Name: idx_veiculos_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_veiculos_usuario_id ON public.veiculos USING btree (usuario_id);


--
-- TOC entry 5009 (class 2620 OID 34419)
-- Name: admins prevent_duplicate_email_admins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_duplicate_email_admins BEFORE INSERT OR UPDATE OF email ON public.admins FOR EACH ROW EXECUTE FUNCTION public.check_email_across_tables();


--
-- TOC entry 5007 (class 2620 OID 34418)
-- Name: usuarios prevent_duplicate_email_usuarios; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER prevent_duplicate_email_usuarios BEFORE INSERT OR UPDATE OF email ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.check_email_across_tables();


--
-- TOC entry 5010 (class 2620 OID 17910)
-- Name: estacionamento_pagamentos tr_estacionamento_pagamentos_atualizacao; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_estacionamento_pagamentos_atualizacao BEFORE UPDATE ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();


--
-- TOC entry 5011 (class 2620 OID 17911)
-- Name: estacionamento_pagamentos tr_limpar_chave_pix; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_limpar_chave_pix BEFORE DELETE ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.limpar_chave_pix();


--
-- TOC entry 5012 (class 2620 OID 17912)
-- Name: estacionamento_pagamentos tr_sincronizar_chave_pix_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_sincronizar_chave_pix_ins AFTER INSERT ON public.estacionamento_pagamentos FOR EACH ROW EXECUTE FUNCTION public.sincronizar_chave_pix();


--
-- TOC entry 5013 (class 2620 OID 17913)
-- Name: estacionamento_pagamentos tr_sincronizar_chave_pix_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_sincronizar_chave_pix_upd AFTER UPDATE OF chave_pix ON public.estacionamento_pagamentos FOR EACH ROW WHEN (((old.chave_pix)::text IS DISTINCT FROM (new.chave_pix)::text)) EXECUTE FUNCTION public.sincronizar_chave_pix();


--
-- TOC entry 5014 (class 2620 OID 17914)
-- Name: horarios_funcionamento update_horarios_funcionamento_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_horarios_funcionamento_updated_at BEFORE UPDATE ON public.horarios_funcionamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5008 (class 2620 OID 17915)
-- Name: vagas update_vagas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_vagas_updated_at BEFORE UPDATE ON public.vagas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 4988 (class 2606 OID 17916)
-- Name: estacionamentos estacionamentos_id_solicitacao_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT estacionamentos_id_solicitacao_fkey FOREIGN KEY (id_solicitacao) REFERENCES public.solicitacoes_estacionamento(id);


--
-- TOC entry 4987 (class 2606 OID 17921)
-- Name: estacionamento_pagamentos fk_estacionamento; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamento_pagamentos
    ADD CONSTRAINT fk_estacionamento FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4989 (class 2606 OID 17926)
-- Name: estacionamentos fk_estacionamentos_admins; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estacionamentos
    ADD CONSTRAINT fk_estacionamentos_admins FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- TOC entry 4994 (class 2606 OID 18071)
-- Name: pagamentos fk_reserva; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT fk_reserva FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE CASCADE;


--
-- TOC entry 4990 (class 2606 OID 17936)
-- Name: horarios_funcionamento horarios_funcionamento_estacionamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.horarios_funcionamento
    ADD CONSTRAINT horarios_funcionamento_estacionamento_id_fkey FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4991 (class 2606 OID 17941)
-- Name: logs_veiculos logs_veiculos_estacionamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_estacionamento_id_fkey FOREIGN KEY (estacionamento_id) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4992 (class 2606 OID 17946)
-- Name: logs_veiculos logs_veiculos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- TOC entry 4993 (class 2606 OID 17951)
-- Name: logs_veiculos logs_veiculos_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.logs_veiculos
    ADD CONSTRAINT logs_veiculos_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE SET NULL;


--
-- TOC entry 5006 (class 2606 OID 34442)
-- Name: notificacoes notificacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notificacoes
    ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4995 (class 2606 OID 17956)
-- Name: pagamentos pagamentos_id_estacionamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_estacionamento_fkey FOREIGN KEY (id_estacionamento) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4996 (class 2606 OID 17961)
-- Name: pagamentos pagamentos_id_reserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_reserva_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE CASCADE;


--
-- TOC entry 4997 (class 2606 OID 17966)
-- Name: pagamentos pagamentos_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4998 (class 2606 OID 17971)
-- Name: pagamentos_pix pagamentos_pix_id_estacionamento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_estacionamento_fkey FOREIGN KEY (id_estacionamento) REFERENCES public.estacionamentos(id) ON DELETE CASCADE;


--
-- TOC entry 4999 (class 2606 OID 17976)
-- Name: pagamentos_pix pagamentos_pix_id_reserva_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_reserva_fkey FOREIGN KEY (id_reserva) REFERENCES public.reservas(id) ON DELETE SET NULL;


--
-- TOC entry 5000 (class 2606 OID 17981)
-- Name: pagamentos_pix pagamentos_pix_id_usuario_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos_pix
    ADD CONSTRAINT pagamentos_pix_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 5001 (class 2606 OID 18056)
-- Name: reservas reservas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 5002 (class 2606 OID 18061)
-- Name: reservas reservas_vaga_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_vaga_id_fkey FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE CASCADE;


--
-- TOC entry 5003 (class 2606 OID 17986)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_aprovado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES public.usuarios(id);


--
-- TOC entry 5004 (class 2606 OID 17991)
-- Name: solicitacoes_estacionamento solicitacoes_estacionamento_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.solicitacoes_estacionamento
    ADD CONSTRAINT solicitacoes_estacionamento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- TOC entry 4986 (class 2606 OID 18001)
-- Name: vagas vagas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vagas
    ADD CONSTRAINT vagas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- TOC entry 5005 (class 2606 OID 18026)
-- Name: veiculos veiculos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


-- Completed on 2025-11-04 21:52:31

--
-- PostgreSQL database dump complete
--

