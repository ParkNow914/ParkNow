const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('.');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ParkNow Payment Gateway API',
      version: '1.0.0',
      description: 'API para processamento de pagamentos do ParkNow',
      contact: {
        name: 'Suporte',
        email: 'suporte@parknow.com.br'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Servidor de desenvolvimento'
      },
      {
        url: 'https://api.parknow.com.br/v1',
        description: 'Produção'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token de autenticação JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
          description: 'Chave de API para autenticação'
        }
      },
      schemas: {
        Payment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID do pagamento',
              example: '1234567890'
            },
            status: {
              type: 'string',
              description: 'Status do pagamento',
              example: 'approved',
              enum: ['pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back']
            },
            status_detail: {
              type: 'string',
              description: 'Detalhes do status do pagamento',
              example: 'accredited'
            },
            payment_method: {
              type: 'string',
              description: 'Método de pagamento',
              example: 'pix',
              enum: ['pix', 'credit_card', 'debit_card', 'bank_transfer', 'ticket', 'atm', 'bank_transfer_pix']
            },
            amount: {
              type: 'number',
              format: 'float',
              description: 'Valor do pagamento',
              example: 100.5
            },
            description: {
              type: 'string',
              description: 'Descrição do pagamento',
              example: 'Estacionamento 24h'
            },
            payer_email: {
              type: 'string',
              format: 'email',
              description: 'E-mail do pagador',
              example: 'cliente@exemplo.com'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação do pagamento',
              example: '2023-01-01T12:00:00Z'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Data da última atualização do pagamento',
              example: '2023-01-01T12:05:00Z'
            },
            point_of_interaction: {
              type: 'object',
              properties: {
                qr_code: {
                  type: 'string',
                  description: 'Código QR para pagamento PIX',
                  example: '00020126330014BR.GOV.BCB.PIX0111+551199999999952040000530398654040.005802BR5925FULANO DE TAL6008BRASILIA62070503***6304E2CA'
                },
                qr_code_base64: {
                  type: 'string',
                  description: 'Código QR em base64 para pagamento PIX',
                  example: 'iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt...'
                },
                ticket_url: {
                  type: 'string',
                  format: 'uri',
                  description: 'URL do boleto ou ticket de pagamento',
                  example: 'https://www.mercadopago.com.br/payments/1234567890/ticket?caller_id=123456789&hash=abc123'
                }
              }
            },
            transaction_details: {
              type: 'object',
              properties: {
                net_received_amount: {
                  type: 'number',
                  format: 'float',
                  description: 'Valor líquido recebido',
                  example: 97.5
                },
                total_paid_amount: {
                  type: 'number',
                  format: 'float',
                  description: 'Valor total pago',
                  example: 100.5
                },
                installment_amount: {
                  type: 'number',
                  format: 'float',
                  description: 'Valor da parcela',
                  example: 100.5
                },
                installment_quantity: {
                  type: 'integer',
                  description: 'Número de parcelas',
                  example: 1
                },
                payment_method_reference_id: {
                  type: 'string',
                  description: 'ID de referência do método de pagamento',
                  example: '1234567890'
                }
              }
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              description: 'Metadados adicionais'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error'
            },
            message: {
              type: 'string',
              example: 'Mensagem de erro descritiva'
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    example: 'campo'
                  },
                  message: {
                    type: 'string',
                    example: 'Mensagem de erro específica do campo'
                  }
                }
              }
            }
          }
        }
      },
      parameters: {
        paymentId: {
          name: 'id',
          in: 'path',
          description: 'ID do pagamento',
          required: true,
          schema: {
            type: 'string',
            example: '1234567890'
          }
        },
        limit: {
          name: 'limit',
          in: 'query',
          description: 'Número máximo de itens por página',
          required: false,
          schema: {
            type: 'integer',
            default: 10,
            minimum: 1,
            maximum: 100
          }
        },
        offset: {
          name: 'offset',
          in: 'query',
          description: 'Número de itens para pular',
          required: false,
          schema: {
            type: 'integer',
            default: 0,
            minimum: 0
          }
        },
        status: {
          name: 'status',
          in: 'query',
          description: 'Filtrar por status do pagamento',
          required: false,
          schema: {
            type: 'string',
            enum: ['pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back']
          }
        },
        payment_method: {
          name: 'payment_method',
          in: 'query',
          description: 'Filtrar por método de pagamento',
          required: false,
          schema: {
            type: 'string',
            enum: ['pix', 'credit_card', 'debit_card', 'bank_transfer', 'ticket', 'atm', 'bank_transfer_pix']
          }
        },
        start_date: {
          name: 'start_date',
          in: 'query',
          description: 'Data de início para filtro (formato ISO 8601)',
          required: false,
          schema: {
            type: 'string',
            format: 'date-time'
          }
        },
        end_date: {
          name: 'end_date',
          in: 'query',
          description: 'Data de término para filtro (formato ISO 8601)',
          required: false,
          schema: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Token de acesso ausente ou inválido',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Token de autenticação inválido',
                code: 'UNAUTHORIZED'
              }
            }
          }
        },
        BadRequestError: {
          description: 'Requisição inválida',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Dados inválidos',
                code: 'INVALID_DATA',
                errors: [
                  {
                    field: 'amount',
                    message: 'Deve ser um número positivo'
                  }
                ]
              }
            }
          }
        },
        NotFoundError: {
          description: 'Recurso não encontrado',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Pagamento não encontrado',
                code: 'NOT_FOUND'
              }
            }
          }
        },
        InternalServerError: {
          description: 'Erro interno do servidor',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                status: 'error',
                message: 'Ocorreu um erro inesperado',
                code: 'INTERNAL_SERVER_ERROR'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      },
      {
        apiKey: []
      }
    ]
  },
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/models/*.js'
  ]
};

const specs = swaggerJsdoc(options);

const swaggerUiOptions = {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ParkNow Payment Gateway API',
  customfavIcon: '/favicon.ico'
};

module.exports = (app) => {
  // Rota da documentação Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));
  
  // Rota para o arquivo JSON do Swagger
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
  
  return app;
};
