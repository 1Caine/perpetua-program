/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/perpetua.json`.
 */
export type Perpetua = {
  "address": "PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit",
  "metadata": {
    "name": "perpetua",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Perpetua: non-custodial onchain inheritance on Solana",
    "repository": "https://github.com/1Caine/perpetua"
  },
  "instructions": [
    {
      "name": "addSolAsset",
      "discriminator": [
        118,
        33,
        127,
        71,
        67,
        213,
        125,
        23
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "nativeMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "reserve",
          "docs": [
            "The owner's own wSOL reserve: a token account whose authority is the owner, at an",
            "address derived from the switch so DEX routers never touch or close it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "switch"
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        },
        {
          "name": "recipient",
          "type": "u8"
        }
      ]
    },
    {
      "name": "addTokenAsset",
      "discriminator": [
        17,
        191,
        18,
        230,
        45,
        67,
        193,
        240
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "recipient",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  119,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "checkIn",
      "discriminator": [
        209,
        253,
        4,
        217,
        250,
        241,
        207,
        50
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createSwitch",
      "discriminator": [
        120,
        11,
        193,
        114,
        80,
        234,
        99,
        128
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  119,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "id"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "id",
          "type": "u32"
        },
        {
          "name": "intervalSecs",
          "type": "i64"
        },
        {
          "name": "heirs",
          "type": {
            "vec": {
              "defined": {
                "name": "heirInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "deliverSol",
      "discriminator": [
        24,
        233,
        184,
        139,
        240,
        103,
        2,
        127
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "heir",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "heirIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "deliverToken",
      "discriminator": [
        239,
        126,
        0,
        100,
        151,
        0,
        134,
        205
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "heir"
        },
        {
          "name": "heirToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "heirIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "fundSol",
      "discriminator": [
        156,
        129,
        219,
        34,
        161,
        214,
        231,
        56
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "nativeMint",
          "address": "So11111111111111111111111111111111111111112"
        },
        {
          "name": "reserve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "switch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "engine",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "removeAsset",
      "discriminator": [
        139,
        243,
        2,
        142,
        50,
        197,
        54,
        181
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "resume",
      "discriminator": [
        1,
        166,
        51,
        170,
        127,
        32,
        141,
        206
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "setAdmin",
      "discriminator": [
        251,
        163,
        0,
        52,
        91,
        194,
        187,
        92
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setAssetAmount",
      "discriminator": [
        93,
        108,
        230,
        32,
        164,
        141,
        175,
        196
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAssetRecipient",
      "discriminator": [
        147,
        112,
        206,
        175,
        16,
        62,
        189,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        },
        {
          "name": "recipient",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setEngine",
      "discriminator": [
        66,
        87,
        78,
        112,
        218,
        132,
        52,
        45
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "engine",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setLetters",
      "discriminator": [
        197,
        31,
        138,
        142,
        49,
        206,
        0,
        78
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "letters",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setPerpetuaMint",
      "discriminator": [
        35,
        51,
        16,
        210,
        128,
        96,
        20,
        114
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        }
      ],
      "args": []
    },
    {
      "name": "settleAsset",
      "discriminator": [
        145,
        237,
        120,
        129,
        188,
        70,
        255,
        26
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "source",
          "docs": [
            "because it may have been closed, re-delegated or frozen."
          ],
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "skipAsset",
      "discriminator": [
        24,
        235,
        193,
        67,
        219,
        5,
        121,
        47
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "source"
        }
      ],
      "args": [
        {
          "name": "index",
          "type": "u8"
        }
      ]
    },
    {
      "name": "sweepSol",
      "discriminator": [
        48,
        81,
        27,
        227,
        28,
        145,
        224,
        204
      ],
      "accounts": [
        {
          "name": "engine",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sweepToken",
      "discriminator": [
        197,
        177,
        210,
        55,
        42,
        183,
        103,
        83
      ],
      "accounts": [
        {
          "name": "engine",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "engineToken",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "trigger",
      "discriminator": [
        215,
        172,
        161,
        36,
        115,
        157,
        116,
        147
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  119,
                  110,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "switch.owner",
                "account": "switch"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateHeirs",
      "discriminator": [
        50,
        156,
        185,
        104,
        246,
        69,
        172,
        28
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heirs",
          "type": {
            "vec": {
              "defined": {
                "name": "heirInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "updateInterval",
      "discriminator": [
        0,
        103,
        203,
        94,
        136,
        229,
        87,
        49
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "switch"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "switch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  105,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "switch.id",
                "account": "switch"
              }
            ]
          }
        },
        {
          "name": "tierHolding",
          "optional": true
        },
        {
          "name": "tierMint",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "intervalSecs",
          "type": "i64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "ownerProfile",
      "discriminator": [
        51,
        38,
        236,
        107,
        38,
        26,
        62,
        91
      ]
    },
    {
      "name": "switch",
      "discriminator": [
        242,
        175,
        214,
        214,
        230,
        53,
        61,
        158
      ]
    }
  ],
  "events": [
    {
      "name": "assetAdded",
      "discriminator": [
        174,
        91,
        37,
        97,
        47,
        14,
        45,
        93
      ]
    },
    {
      "name": "assetRemoved",
      "discriminator": [
        100,
        213,
        14,
        53,
        106,
        252,
        170,
        140
      ]
    },
    {
      "name": "assetSettled",
      "discriminator": [
        211,
        110,
        161,
        220,
        207,
        71,
        74,
        25
      ]
    },
    {
      "name": "assetSkipped",
      "discriminator": [
        142,
        47,
        144,
        79,
        199,
        158,
        123,
        238
      ]
    },
    {
      "name": "assetUpdated",
      "discriminator": [
        205,
        81,
        132,
        139,
        249,
        35,
        249,
        127
      ]
    },
    {
      "name": "checkedIn",
      "discriminator": [
        211,
        80,
        198,
        244,
        196,
        84,
        212,
        150
      ]
    },
    {
      "name": "configChanged",
      "discriminator": [
        147,
        25,
        86,
        98,
        98,
        77,
        78,
        192
      ]
    },
    {
      "name": "delivered",
      "discriminator": [
        148,
        178,
        60,
        250,
        87,
        49,
        149,
        65
      ]
    },
    {
      "name": "heirsUpdated",
      "discriminator": [
        34,
        229,
        4,
        103,
        206,
        213,
        16,
        19
      ]
    },
    {
      "name": "intervalUpdated",
      "discriminator": [
        57,
        103,
        104,
        176,
        240,
        46,
        119,
        125
      ]
    },
    {
      "name": "lettersUpdated",
      "discriminator": [
        110,
        210,
        213,
        247,
        223,
        205,
        149,
        133
      ]
    },
    {
      "name": "switchCancelled",
      "discriminator": [
        46,
        196,
        183,
        131,
        1,
        130,
        141,
        151
      ]
    },
    {
      "name": "switchCreated",
      "discriminator": [
        55,
        40,
        99,
        122,
        102,
        61,
        8,
        156
      ]
    },
    {
      "name": "switchExecuted",
      "discriminator": [
        231,
        32,
        85,
        68,
        239,
        254,
        31,
        76
      ]
    },
    {
      "name": "switchPaused",
      "discriminator": [
        158,
        111,
        157,
        114,
        184,
        122,
        246,
        79
      ]
    },
    {
      "name": "switchResumed",
      "discriminator": [
        177,
        58,
        239,
        120,
        93,
        38,
        89,
        235
      ]
    },
    {
      "name": "switchTriggered",
      "discriminator": [
        108,
        114,
        165,
        112,
        188,
        173,
        179,
        11
      ]
    },
    {
      "name": "treasurySwept",
      "discriminator": [
        235,
        3,
        4,
        187,
        184,
        147,
        44,
        99
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the admin can do this"
    },
    {
      "code": 6001,
      "name": "notUpgradeAuthority",
      "msg": "Only the program's upgrade authority can initialize the protocol"
    },
    {
      "code": 6002,
      "name": "protocolPaused",
      "msg": "New switches are paused"
    },
    {
      "code": 6003,
      "name": "badSwitchId",
      "msg": "Switch id must equal the owner's next switch id"
    },
    {
      "code": 6004,
      "name": "switchLimit",
      "msg": "This tier has reached its switch limit"
    },
    {
      "code": 6005,
      "name": "badInterval",
      "msg": "Interval is not allowed for this tier"
    },
    {
      "code": 6006,
      "name": "noHeirs",
      "msg": "At least one heir is required"
    },
    {
      "code": 6007,
      "name": "tooManyHeirs",
      "msg": "Too many heirs for this tier"
    },
    {
      "code": 6008,
      "name": "sharesNot100",
      "msg": "Heir shares must add up to exactly 100%"
    },
    {
      "code": 6009,
      "name": "zeroShare",
      "msg": "Every heir needs a share above zero"
    },
    {
      "code": 6010,
      "name": "duplicateHeir",
      "msg": "An heir appears twice"
    },
    {
      "code": 6011,
      "name": "invalidHeir",
      "msg": "This address cannot be an heir"
    },
    {
      "code": 6012,
      "name": "notEditable",
      "msg": "The switch can no longer be edited"
    },
    {
      "code": 6013,
      "name": "notActive",
      "msg": "The switch is not active"
    },
    {
      "code": 6014,
      "name": "notPaused",
      "msg": "The switch is not paused"
    },
    {
      "code": 6015,
      "name": "tooEarly",
      "msg": "The check-in deadline and grace period have not passed"
    },
    {
      "code": 6016,
      "name": "notTriggered",
      "msg": "Execution has not started"
    },
    {
      "code": 6017,
      "name": "badAssetIndex",
      "msg": "Asset index out of range"
    },
    {
      "code": 6018,
      "name": "badHeirIndex",
      "msg": "Heir index out of range"
    },
    {
      "code": 6019,
      "name": "tooManyAssets",
      "msg": "This switch already holds the maximum number of assets"
    },
    {
      "code": 6020,
      "name": "duplicateAsset",
      "msg": "This token account is already part of the switch"
    },
    {
      "code": 6021,
      "name": "alreadyDelegated",
      "msg": "This token account is delegated to another program"
    },
    {
      "code": 6022,
      "name": "accountFrozen",
      "msg": "This token account is frozen"
    },
    {
      "code": 6023,
      "name": "zeroAmount",
      "msg": "Amount must be above zero"
    },
    {
      "code": 6024,
      "name": "solBelowMinimum",
      "msg": "SOL amount is below the minimum"
    },
    {
      "code": 6025,
      "name": "solAlreadyAdded",
      "msg": "This switch already holds SOL; add to it instead"
    },
    {
      "code": 6026,
      "name": "useSolInstruction",
      "msg": "Use the SOL instruction for native SOL"
    },
    {
      "code": 6027,
      "name": "nftNeedsHolder",
      "msg": "NFTs need the Holder tier"
    },
    {
      "code": 6028,
      "name": "nftNeedsRecipient",
      "msg": "An NFT must go to one named heir"
    },
    {
      "code": 6029,
      "name": "lettersNeedHolder",
      "msg": "Letters need the Holder tier"
    },
    {
      "code": 6030,
      "name": "badRecipient",
      "msg": "Recipient is not one of the heirs"
    },
    {
      "code": 6031,
      "name": "unsupportedMint",
      "msg": "This token's mint has an extension Perpetua cannot move safely"
    },
    {
      "code": 6032,
      "name": "accountMismatch",
      "msg": "Account does not match the switch"
    },
    {
      "code": 6033,
      "name": "wrongTokenProgram",
      "msg": "Wrong token program for this asset"
    },
    {
      "code": 6034,
      "name": "badAssetState",
      "msg": "The asset is not in the expected state"
    },
    {
      "code": 6035,
      "name": "alreadyDelivered",
      "msg": "This heir has already received their share"
    },
    {
      "code": 6036,
      "name": "cannotSkipYet",
      "msg": "The asset can still be settled"
    },
    {
      "code": 6037,
      "name": "mintAlreadySet",
      "msg": "The $PERPETUA mint is already set"
    },
    {
      "code": 6038,
      "name": "badTierAccount",
      "msg": "Tier holding does not belong to the owner or is not $PERPETUA"
    },
    {
      "code": 6039,
      "name": "letterCountMismatch",
      "msg": "One letter hash per heir is required"
    },
    {
      "code": 6040,
      "name": "remainingAccountsMismatch",
      "msg": "Remaining accounts do not match the switch assets"
    },
    {
      "code": 6041,
      "name": "treasuryMinimum",
      "msg": "The treasury must keep its minimum balance"
    },
    {
      "code": 6042,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "asset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "docs": [
              "The owner's token account the switch PDA is delegate on. For SOL this is the",
              "owner's reserve wSOL account (authority = owner)."
            ],
            "type": "pubkey"
          },
          {
            "name": "token2022",
            "type": "bool"
          },
          {
            "name": "recipient",
            "docs": [
              "Heir index that receives the whole asset, or SPLIT."
            ],
            "type": "u8"
          },
          {
            "name": "state",
            "type": "u8"
          },
          {
            "name": "approved",
            "docs": [
              "Amount approved (delegated) at the last edit."
            ],
            "type": "u64"
          },
          {
            "name": "escrowed",
            "docs": [
              "Amount held for heirs after settlement and fee."
            ],
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "delivered",
            "docs": [
              "Bit i set = heir i has received their share."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "assetAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "assetRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "assetSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "assetSkipped",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "assetUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "recipient",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "checkedIn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "checkIns",
            "type": "u32"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Can set the engine wallet, pause new setups and set the $PERPETUA mint once.",
              "Cannot touch any switch or any user asset."
            ],
            "type": "pubkey"
          },
          {
            "name": "engine",
            "docs": [
              "Buyback engine wallet: the only key that can move funds out of the treasury PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "perpetuaMint",
            "docs": [
              "$PERPETUA mint used for tier checks. Default (all zeros) until set; set once only."
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Pauses creation of new switches only. Check-ins, edits, cancels and execution never pause."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "switchesCreated",
            "type": "u64"
          },
          {
            "name": "switchesActive",
            "type": "u64"
          },
          {
            "name": "executions",
            "type": "u64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "configChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "engine",
            "type": "pubkey"
          },
          {
            "name": "perpetuaMint",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "delivered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "heir",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "docs": [
              "True when a SOL share was too small to open an empty wallet and went to the treasury."
            ],
            "type": "bool"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "heir",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "docs": [
              "Share in basis points. All heirs sum to exactly 10_000."
            ],
            "type": "u16"
          },
          {
            "name": "letter",
            "docs": [
              "SHA-256 of the sealed letter envelope for this heir, or zeros for no letter."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "heirInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "heirsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "heirs",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "intervalUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "intervalSecs",
            "type": "i64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lettersUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "letters",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "ownerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "activeSwitches",
            "type": "u32"
          },
          {
            "name": "nextId",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "switch",
      "docs": [
        "Field order is part of the public interface: the letter release service reads",
        "`status` at byte offset 45 (8 discriminator + 32 owner + 4 id + 1 bump)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "reserveBump",
            "type": "u8"
          },
          {
            "name": "intervalSecs",
            "type": "i64"
          },
          {
            "name": "graceSecs",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lastCheckIn",
            "type": "i64"
          },
          {
            "name": "triggeredAt",
            "type": "i64"
          },
          {
            "name": "executedAt",
            "type": "i64"
          },
          {
            "name": "checkIns",
            "type": "u32"
          },
          {
            "name": "heirs",
            "type": {
              "vec": {
                "defined": {
                  "name": "heir"
                }
              }
            }
          },
          {
            "name": "assets",
            "type": {
              "vec": {
                "defined": {
                  "name": "asset"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "switchCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "revoked",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "switchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u32"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "intervalSecs",
            "type": "i64"
          },
          {
            "name": "heirs",
            "type": "u8"
          },
          {
            "name": "feeLamports",
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "switchExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "switchPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "switchResumed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "switchTriggered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "switch",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "caller",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u8"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "treasurySwept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "type": "u64",
      "value": "10000"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "customIntervalMaxDays",
      "type": "i64",
      "value": "1825"
    },
    {
      "name": "customIntervalMinDays",
      "docs": [
        "Patron tier: any interval from 7 days to 5 years."
      ],
      "type": "i64",
      "value": "7"
    },
    {
      "name": "executionFeeBps",
      "docs": [
        "Execution fee on assets delivered, in basis points (0.5%)."
      ],
      "type": "u64",
      "value": "50"
    },
    {
      "name": "freeMaxHeirs",
      "type": "u8",
      "value": "2"
    },
    {
      "name": "freeMaxSwitches",
      "type": "u32",
      "value": "1"
    },
    {
      "name": "graceDays",
      "docs": [
        "Grace period after a missed deadline before anyone can trigger execution."
      ],
      "type": "i64",
      "value": "7"
    },
    {
      "name": "holderMaxHeirs",
      "type": "u8",
      "value": "10"
    },
    {
      "name": "holderMaxSwitches",
      "type": "u32",
      "value": "3"
    },
    {
      "name": "holderThresholdTokens",
      "docs": [
        "$PERPETUA held (whole tokens) for each tier."
      ],
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "maxAssets",
      "docs": [
        "Assets per switch. Cancelling revokes every delegation in one transaction."
      ],
      "type": "u8",
      "value": "12"
    },
    {
      "name": "minSolLamports",
      "docs": [
        "Smallest SOL amount that can be set aside for heirs (0.01 SOL)."
      ],
      "type": "u64",
      "value": "10000000"
    },
    {
      "name": "ownerSeed",
      "type": "bytes",
      "value": "[111, 119, 110, 101, 114]"
    },
    {
      "name": "patronMaxHeirs",
      "docs": [
        "Protocol maximum. Sixteen heirs is what fits in one wallet-signed transaction",
        "with room left for wallet safety guards."
      ],
      "type": "u8",
      "value": "16"
    },
    {
      "name": "patronThresholdTokens",
      "type": "u64",
      "value": "10000000"
    },
    {
      "name": "reserveSeed",
      "type": "bytes",
      "value": "[114, 101, 115, 101, 114, 118, 101]"
    },
    {
      "name": "setupFeeLamports",
      "docs": [
        "One-time fee for a Free-tier switch, paid into the treasury PDA by the program."
      ],
      "type": "u64",
      "value": "50000000"
    },
    {
      "name": "skipAfterDays",
      "docs": [
        "After execution starts, an asset that still cannot be settled may be skipped after this long."
      ],
      "type": "i64",
      "value": "30"
    },
    {
      "name": "standardIntervalDays",
      "docs": [
        "Check-in intervals available to every tier."
      ],
      "type": {
        "array": [
          "i64",
          4
        ]
      },
      "value": "[30, 90, 180, 365]"
    },
    {
      "name": "switchSeed",
      "type": "bytes",
      "value": "[115, 119, 105, 116, 99, 104]"
    },
    {
      "name": "treasurySeed",
      "type": "bytes",
      "value": "[116, 114, 101, 97, 115, 117, 114, 121]"
    }
  ]
};
