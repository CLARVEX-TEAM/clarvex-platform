map(
  if .id == "l8q88gnWzcwYDpvp" then
    (.nodes[] | select(.id == "5d3d3964-9d34-4577-a22e-717192cc0a25") | .parameters.chatId) as $telegramChatId
    | (.nodes[] | select(.id == "5d3d3964-9d34-4577-a22e-717192cc0a25") | .credentials) as $telegramCredentials
    | .nodes = (
      [
        .nodes[]
        | select(
            .id != "bf0c3cf1-9914-4804-98c0-cbdb94b38014"
            and .id != "86e5aeb8-91d2-4ca6-bfb4-ec4d34e06b46"
          )
        | if .id == "565f2335-ad28-4bb6-97e3-3ddd669ac8c5" then
            .name = "Es PDF?"
          elif .id == "5c7e7df4-2c30-4889-bf0c-8d5705b27861" then
            .name = "Telegram - Documento (PDF)"
          elif .id == "5d3d3964-9d34-4577-a22e-717192cc0a25" then
            .name = "Telegram - Foto"
          else
            .
          end
      ]
      + [
          {
            "parameters": {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "leftValue": "",
                  "typeValidation": "strict",
                  "version": 3
                },
                "conditions": [
                  {
                    "id": "cond-format-alert",
                    "leftValue": "={{ $json.body.format }}",
                    "rightValue": "alert",
                    "operator": {
                      "type": "string",
                      "operation": "equals",
                      "name": "filter.operator.equals"
                    }
                  }
                ],
                "combinator": "and"
              },
              "options": {}
            },
            "id": "bf0c3cf1-9914-4804-98c0-cbdb94b38014",
            "name": "Es alerta?",
            "type": "n8n-nodes-base.if",
            "typeVersion": 2.3,
            "position": [-304, 64]
          },
          {
            "parameters": {
              "operation": "sendMessage",
              "chatId": $telegramChatId,
              "text": "={{ $json.body.title + \"\\n\\n\" + $json.body.text }}",
              "additionalFields": {}
            },
            "id": "86e5aeb8-91d2-4ca6-bfb4-ec4d34e06b46",
            "name": "Telegram - Alerta",
            "type": "n8n-nodes-base.telegram",
            "typeVersion": 1.2,
            "position": [112, -304],
            "credentials": $telegramCredentials
          }
        ]
    )
    | .connections = {
        "Webhook": {
          "main": [[{"node": "Es alerta?", "type": "main", "index": 0}]]
        },
        "Es alerta?": {
          "main": [
            [{"node": "Telegram - Alerta", "type": "main", "index": 0}],
            [{"node": "Es PDF?", "type": "main", "index": 0}]
          ]
        },
        "Es PDF?": {
          "main": [
            [{"node": "Telegram - Documento (PDF)", "type": "main", "index": 0}],
            [{"node": "Telegram - Foto", "type": "main", "index": 0}]
          ]
        }
      }
  else
    .
  end
)
