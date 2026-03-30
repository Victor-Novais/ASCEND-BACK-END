# ASCEND Back-End API - Guia Completo de Testes com Insomnia

## Descricao do projeto

Backend desenvolvido com **NestJS (Node.js + TypeScript)**, usando **Prisma ORM** e banco PostgreSQL (Supabase), com autenticacao JWT e controle de acesso por perfis (`ADMIN`, `AVALIADOR`, `CLIENTE`).

Este README foi feito para permitir que qualquer dev teste **todas as rotas reais da API** via Insomnia.

## Pre-requisitos

- Node.js 20+ (recomendado)
- npm
- Banco PostgreSQL configurado
- Variaveis de ambiente configuradas (ex.: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT`)
- Insomnia instalado

## Configuracao inicial

### 1) Instalar dependencias

```bash
npm install
```

### 2) Rodar a API

```bash
# desenvolvimento
npm run start:dev
```

### 3) Porta e baseURL

- A API sobe em `process.env.PORT` ou `3000` por padrao.
- Base URL local padrao:

```text
http://localhost:3000
```

## Variaveis no Insomnia

Crie um Environment no Insomnia com:

```json
{
  "baseURL": "http://localhost:3000",
  "token": ""
}
```

Depois do login, cole o JWT em `token`.

---

## Testando com Insomnia

## Autenticacao (JWT)

### Fluxo de autenticacao

1. Chame `POST /auth/login` com email e senha.
2. Copie o `accessToken` retornado.
3. Salve no environment do Insomnia (`token`).
4. Nas rotas protegidas, envie:

```text
Authorization: Bearer {{token}}
```

### Como copiar o token no Insomnia

1. Envie a requisicao de login.
2. Na resposta JSON, copie o valor de `accessToken`.
3. Abra `Manage Environments`.
4. Cole em `"token": "SEU_TOKEN_AQUI"`.

---

## Modulo App

### Health / Home

- Metodo: `GET`
- URL: `{{baseURL}}/`
- Autenticacao: `Nao`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/`
4. Adicionar header `Content-Type`
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
"Hello World!"
```

---

## Modulo Auth

### Login

- Metodo: `POST`
- URL: `{{baseURL}}/auth/login`
- Autenticacao: `Nao`

#### Body (se houver):

```json
{
  "email": "admin@ascend.com",
  "password": "SenhaForte123"
}
```

#### Headers:

```text
Content-Type: application/json
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL `{{baseURL}}/auth/login`
4. Adicionar header `Content-Type: application/json`
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `200` (ou `201`, conforme configuracao global)
- Exemplo de resposta:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

### Registro

- Metodo: `POST`
- URL: `{{baseURL}}/auth/register`
- Autenticacao: `Nao`

Body:
```json
{
  "name": "João Silva",
  "email": "joao@ascend.com",
  "password": "123456"
}
```

Resposta esperada:
Status: `201`
```json
{
  "user": {
    "id": "...",
    "name": "João Silva",
    "email": "joao@ascend.com",
    "role": "CLIENTE",
    "createdAt": "..."
  },
  "accessToken": "jwt..."
}
```

### Perfil do usuario autenticado

- Metodo: `GET`
- URL: `{{baseURL}}/auth/me`
- Autenticacao: `Sim (Bearer Token)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/auth/me`
4. Adicionar headers `Content-Type` e `Authorization`
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": "1b2c3d4e-1111-2222-3333-444455556666",
  "email": "admin@ascend.com",
  "role": "ADMIN"
}
```

---

## Modulo Users

### Criar usuario

- Metodo: `POST`
- URL: `{{baseURL}}/users`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "name": "Maria Silva",
  "email": "maria@ascend.com",
  "password": "SenhaForte123",
  "role": "AVALIADOR"
}
```

`id` tambem pode ser enviado (UUID v4) de forma opcional.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL `{{baseURL}}/users`
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `201`
- Exemplo de resposta:

```json
{
  "id": "1b2c3d4e-1111-2222-3333-444455556666",
  "name": "Maria Silva",
  "email": "maria@ascend.com",
  "role": "AVALIADOR",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Listar usuarios

- Metodo: `GET`
- URL: `{{baseURL}}/users`
- Autenticacao: `Sim (Bearer Token - role ADMIN ou AVALIADOR)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/users`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
[
  {
    "id": "1b2c3d4e-1111-2222-3333-444455556666",
    "name": "Maria Silva",
    "email": "maria@ascend.com",
    "role": "AVALIADOR",
    "createdAt": "2026-03-30T12:00:00.000Z"
  }
]
```

### Buscar usuario por ID

- Metodo: `GET`
- URL: `{{baseURL}}/users/:id`
- Autenticacao: `Sim (Bearer Token)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL com UUID v4, ex. `{{baseURL}}/users/1b2c3d4e-1111-2222-3333-444455556666`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": "1b2c3d4e-1111-2222-3333-444455556666",
  "name": "Maria Silva",
  "email": "maria@ascend.com",
  "role": "AVALIADOR",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Atualizar usuario

- Metodo: `PATCH`
- URL: `{{baseURL}}/users/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "name": "Maria Souza",
  "password": "NovaSenhaSegura123",
  "role": "CLIENTE"
}
```

Todos os campos sao opcionais em atualizacao.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `PATCH`
3. Inserir URL com UUID v4
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": "1b2c3d4e-1111-2222-3333-444455556666",
  "name": "Maria Souza",
  "email": "maria@ascend.com",
  "role": "CLIENTE",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Remover usuario

- Metodo: `DELETE`
- URL: `{{baseURL}}/users/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `DELETE`
3. Inserir URL com UUID v4
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": "1b2c3d4e-1111-2222-3333-444455556666",
  "name": "Maria Souza",
  "email": "maria@ascend.com",
  "role": "CLIENTE",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

---

## Modulo Companies

### Criar empresa

- Metodo: `POST`
- URL: `{{baseURL}}/companies`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "name": "Empresa XPTO",
  "segment": "Tecnologia",
  "size": "MEDIA",
  "responsible": "Carlos Lima",
  "responsibleEmail": "carlos@xpto.com",
  "responsiblePhone": "+55 11 99999-0000",
  "cnpj": "12.345.678/0001-90",
  "address": "Sao Paulo - SP",
  "createdById": "1b2c3d4e-1111-2222-3333-444455556666",
  "evaluatorIds": [
    "2c3d4e5f-1111-2222-3333-444455556666"
  ]
}
```

Campos opcionais: `size`, `responsiblePhone`, `cnpj`, `address`, `createdById`, `evaluatorIds`.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL `{{baseURL}}/companies`
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `201`
- Exemplo de resposta:

```json
{
  "id": 1,
  "name": "Empresa XPTO",
  "segment": "Tecnologia",
  "size": "MEDIA",
  "responsible": "Carlos Lima",
  "responsibleEmail": "carlos@xpto.com",
  "responsiblePhone": "+55 11 99999-0000",
  "cnpj": "12.345.678/0001-90",
  "address": "Sao Paulo - SP",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Listar empresas

- Metodo: `GET`
- URL: `{{baseURL}}/companies`
- Autenticacao: `Sim (Bearer Token - role ADMIN ou AVALIADOR)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/companies`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
[
  {
    "id": 1,
    "name": "Empresa XPTO",
    "segment": "Tecnologia",
    "responsible": "Carlos Lima",
    "responsibleEmail": "carlos@xpto.com",
    "createdAt": "2026-03-30T12:00:00.000Z"
  }
]
```

### Buscar empresa por ID

- Metodo: `GET`
- URL: `{{baseURL}}/companies/:id`
- Autenticacao: `Sim (Bearer Token - ADMIN, AVALIADOR, CLIENTE)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL com ID numerico, ex. `{{baseURL}}/companies/1`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 1,
  "name": "Empresa XPTO",
  "segment": "Tecnologia",
  "size": "MEDIA",
  "responsible": "Carlos Lima",
  "responsibleEmail": "carlos@xpto.com",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Atualizar empresa

- Metodo: `PATCH`
- URL: `{{baseURL}}/companies/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "name": "Empresa XPTO Atualizada",
  "segment": "Financeiro",
  "size": "GRANDE",
  "responsible": "Ana Costa",
  "responsibleEmail": "ana@xpto.com",
  "responsiblePhone": "+55 11 98888-0000",
  "cnpj": "98.765.432/0001-10",
  "address": "Curitiba - PR",
  "evaluatorIds": [
    "2c3d4e5f-1111-2222-3333-444455556666",
    "3d4e5f6a-1111-2222-3333-444455556666"
  ]
}
```

Todos os campos sao opcionais em atualizacao.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `PATCH`
3. Inserir URL com ID numerico
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 1,
  "name": "Empresa XPTO Atualizada",
  "segment": "Financeiro",
  "size": "GRANDE",
  "responsible": "Ana Costa",
  "responsibleEmail": "ana@xpto.com"
}
```

### Remover empresa

- Metodo: `DELETE`
- URL: `{{baseURL}}/companies/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `DELETE`
3. Inserir URL com ID numerico
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 1,
  "name": "Empresa XPTO Atualizada",
  "segment": "Financeiro"
}
```

---

## Modulo Questions

### Criar pergunta

- Metodo: `POST`
- URL: `{{baseURL}}/questions`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "text": "A empresa possui politica formal de seguranca?",
  "category": "SEGURANCA",
  "weight": 8.5,
  "responseType": "YES_NO",
  "evidenceRequired": true,
  "hint": "Anexar politica vigente",
  "createdById": "1b2c3d4e-1111-2222-3333-444455556666"
}
```

Categorias validas: `GOVERNANCA`, `SEGURANCA`, `PROCESSOS`, `INFRAESTRUTURA`, `CULTURA`.
Tipos de resposta: `YES_NO`, `SCALE`.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL `{{baseURL}}/questions`
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `201`
- Exemplo de resposta:

```json
{
  "id": 10,
  "version": 1,
  "text": "A empresa possui politica formal de seguranca?",
  "category": "SEGURANCA",
  "weight": "8.50",
  "responseType": "YES_NO",
  "evidenceRequired": true,
  "isActive": true
}
```

### Listar perguntas

- Metodo: `GET`
- URL: `{{baseURL}}/questions`
- Autenticacao: `Sim (Bearer Token - ADMIN, AVALIADOR, CLIENTE)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/questions`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
[
  {
    "id": 10,
    "version": 1,
    "text": "A empresa possui politica formal de seguranca?",
    "category": "SEGURANCA",
    "weight": "8.50",
    "responseType": "YES_NO",
    "evidenceRequired": true,
    "isActive": true
  }
]
```

### Buscar pergunta por ID

- Metodo: `GET`
- URL: `{{baseURL}}/questions/:id`
- Autenticacao: `Sim (Bearer Token - ADMIN, AVALIADOR, CLIENTE)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL com ID numerico, ex. `{{baseURL}}/questions/10`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 10,
  "version": 1,
  "text": "A empresa possui politica formal de seguranca?",
  "category": "SEGURANCA",
  "weight": "8.50",
  "responseType": "YES_NO",
  "evidenceRequired": true,
  "isActive": true
}
```

### Criar nova versao de pergunta

- Metodo: `PUT`
- URL: `{{baseURL}}/questions/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

```json
{
  "text": "A empresa possui politica de seguranca revisada no ultimo ano?",
  "weight": 9.0,
  "changedById": "1b2c3d4e-1111-2222-3333-444455556666"
}
```

No DTO, apenas `changedById` e obrigatorio. Os demais campos sao opcionais.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `PUT`
3. Inserir URL com ID numerico
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 10,
  "version": 2,
  "text": "A empresa possui politica de seguranca revisada no ultimo ano?",
  "category": "SEGURANCA",
  "weight": "9.00",
  "responseType": "YES_NO",
  "evidenceRequired": true,
  "isActive": true
}
```

### Inativar pergunta (soft delete)

- Metodo: `DELETE`
- URL: `{{baseURL}}/questions/:id`
- Autenticacao: `Sim (Bearer Token - role ADMIN)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `DELETE`
3. Inserir URL com ID numerico
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 10,
  "isActive": false
}
```

---

## Modulo Assessments

### Criar assessment

- Metodo: `POST`
- URL: `{{baseURL}}/assessments`
- Autenticacao: `Sim (Bearer Token - role ADMIN ou AVALIADOR)`

#### Body (se houver):

```json
{
  "companyId": 1,
  "assessorId": "2c3d4e5f-1111-2222-3333-444455556666",
  "status": "NOT_STARTED",
  "startedAt": "2026-03-30T10:00:00.000Z",
  "completedAt": "2026-03-30T12:00:00.000Z"
}
```

Campos opcionais: `status`, `startedAt`, `completedAt`.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL `{{baseURL}}/assessments`
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `201`
- Exemplo de resposta:

```json
{
  "id": 100,
  "companyId": 1,
  "assessorId": "2c3d4e5f-1111-2222-3333-444455556666",
  "status": "NOT_STARTED",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Inserir/atualizar respostas do assessment

- Metodo: `PUT`
- URL: `{{baseURL}}/assessments/:id/responses`
- Autenticacao: `Sim (Bearer Token - role ADMIN ou AVALIADOR)`

#### Body (se houver):

```json
{
  "responses": [
    {
      "questionId": 10,
      "responseValue": "SIM",
      "evidence": "Politica publicada no portal interno",
      "evidenceFileUrl": "https://files.exemplo.com/politica.pdf",
      "observation": "Documento revisado em 2026",
      "evidenceFiles": [
        {
          "fileName": "politica-seguranca.pdf",
          "fileUrl": "https://files.exemplo.com/politica-seguranca.pdf",
          "fileSize": 245760,
          "mimeType": "application/pdf"
        }
      ]
    }
  ]
}
```

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `PUT`
3. Inserir URL com ID numerico, ex. `{{baseURL}}/assessments/100/responses`
4. Adicionar headers
5. Inserir body JSON
6. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 100,
  "status": "IN_PROGRESS",
  "responses": [
    {
      "questionId": 10,
      "responseValue": "SIM",
      "evidence": "Politica publicada no portal interno"
    }
  ]
}
```

### Submeter assessment (gera/retorna report)

- Metodo: `POST`
- URL: `{{baseURL}}/assessments/:id/submit`
- Autenticacao: `Sim (Bearer Token - role ADMIN ou AVALIADOR)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `POST`
3. Inserir URL com ID numerico, ex. `{{baseURL}}/assessments/100/submit`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 55,
  "assessmentId": 100,
  "totalScore": "78.50",
  "maturityLevel": "EFICAZ",
  "payload": {
    "assessmentId": 100,
    "totalScore": 78.5,
    "maturityLevel": "EFICAZ",
    "categoryScores": {
      "GOVERNANCA": 80,
      "SEGURANCA": 75,
      "PROCESSOS": 79,
      "INFRAESTRUTURA": 82,
      "CULTURA": 77
    },
    "strengths": [],
    "weaknesses": [],
    "recommendations": []
  }
}
```

### Buscar assessment por ID

- Metodo: `GET`
- URL: `{{baseURL}}/assessments/:id`
- Autenticacao: `Sim (Bearer Token - ADMIN, AVALIADOR, CLIENTE)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL com ID numerico
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
{
  "id": 100,
  "companyId": 1,
  "assessorId": "2c3d4e5f-1111-2222-3333-444455556666",
  "status": "IN_PROGRESS",
  "createdAt": "2026-03-30T12:00:00.000Z"
}
```

### Listar assessments

- Metodo: `GET`
- URL: `{{baseURL}}/assessments`
- Autenticacao: `Sim (Bearer Token - ADMIN, AVALIADOR, CLIENTE)`

#### Body (se houver):

Nao possui body.

#### Headers:

```text
Content-Type: application/json
Authorization: Bearer {{token}}
```

#### Passo a passo no Insomnia:

1. Criar nova requisicao
2. Selecionar metodo `GET`
3. Inserir URL `{{baseURL}}/assessments`
4. Adicionar headers
5. Enviar requisicao

#### Resposta esperada:

- Status: `200`
- Exemplo de resposta:

```json
[
  {
    "id": 100,
    "companyId": 1,
    "assessorId": "2c3d4e5f-1111-2222-3333-444455556666",
    "status": "IN_PROGRESS",
    "createdAt": "2026-03-30T12:00:00.000Z"
  }
]
```

---

## Codigos de erro comuns

- `400 Bad Request`: payload invalido (DTO/validacao), ID mal formatado, regra de negocio violada.
- `401 Unauthorized`: token ausente, invalido ou expirado.
- `403 Forbidden`: usuario autenticado sem permissao de role para a rota.
- `404 Not Found`: recurso nao encontrado.

## Dicas rapidas para nao travar no teste

- Sempre faca login primeiro e salve `{{token}}`.
- Em rotas protegidas, confirme `Authorization: Bearer {{token}}`.
- IDs de `users` sao UUID v4.
- IDs de `companies`, `questions` e `assessments` sao inteiros.
- Com `ValidationPipe` ativo, campos extras no body retornam erro.
