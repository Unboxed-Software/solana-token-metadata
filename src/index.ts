import { initializeKeypair } from "./initializeKeypair"
import {
  Metaplex,
  keypairIdentity,
  bundlrStorage,
  toMetaplexFile,
  findMetadataPda,
} from "@metaplex-foundation/js"
import {
  Connection,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
} from "@solana/web3.js"
import {
  mintTo,
  getOrCreateAssociatedTokenAccount,
  createMint,
  getMint,
} from "@solana/spl-token"
import {
  DataV2,
  createCreateMetadataAccountV2Instruction,
  createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata"
import * as fs from "fs"

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"))
  const user = await initializeKeypair(connection)

  // metaplex setup
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(user))
    .use(
      bundlrStorage({
        address: "https://devnet.bundlr.network",
        providerUrl: "https://api.devnet.solana.com",
        timeout: 60000,
      })
    )

  // helper function to create new mint
  const tokenMint = await createNewMint(
    connection,
    user,
    user.publicKey,
    user.publicKey,
    2
  )

  // helper function to create metadata account
  await createMetadata(
    connection,
    metaplex,
    tokenMint,
    user,
    "token name",
    "symbol",
    "description"
  )

  // helper function to update metadata account
  await updateMetadata(
    connection,
    metaplex,
    tokenMint,
    user,
    "update name",
    "new symbol",
    "update description"
  )

  // helper function to get or create associated token account and mint tokens
  await mintTokenHelper(connection, user, tokenMint, user, 1)
}

async function createNewMint(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey,
  decimals: number
): Promise<PublicKey> {
  // create new token mint
  const tokenMint = await createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals
  )

  console.log(
    `Token Mint: https://explorer.solana.com/address/${tokenMint}?cluster=devnet`
  )

  return tokenMint
}

async function createMetadata(
  connection: Connection,
  metaplex: Metaplex,
  mint: PublicKey,
  user: Keypair,
  name: string,
  symbol: string,
  description: string
) {
  // file to buffer
  const buffer = fs.readFileSync("src/test.png")

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, "test.png")

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: name,
      description: description,
      image: imageUri,
    })
    .run()

  console.log("metadata uri:", uri)

  // get metadata account address
  const metadataPDA = await findMetadataPda(mint)

  // onchain metadata format
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as DataV2

  // transaction to create metadata account
  const transaction = new Transaction().add(
    createCreateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        mint: mint,
        mintAuthority: user.publicKey,
        payer: user.publicKey,
        updateAuthority: user.publicKey,
      },
      {
        createMetadataAccountArgsV2: {
          data: tokenMetadata,
          isMutable: true,
        },
      }
    )
  )

  // send transaction
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [user]
  )

  console.log(
    `Create Metadata Account: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

async function updateMetadata(
  connection: Connection,
  metaplex: Metaplex,
  mint: PublicKey,
  user: Keypair,
  name: string,
  symbol: string,
  description: string
) {
  // file to buffer
  const buffer = fs.readFileSync("src/update.gif")

  // buffer to metaplex file
  const file = toMetaplexFile(buffer, "update.gif")

  // upload image and get image uri
  const imageUri = await metaplex.storage().upload(file)
  console.log("image uri:", imageUri)

  // upload metadata and get metadata uri (off chain metadata)
  const { uri } = await metaplex
    .nfts()
    .uploadMetadata({
      name: name,
      description: description,
      image: imageUri,
    })
    .run()

  console.log("metadata uri:", uri)

  // get metadata account address
  const metadataPDA = await findMetadataPda(mint)

  // onchain metadata format
  const tokenMetadata = {
    name: name,
    symbol: symbol,
    uri: uri,
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as DataV2

  // transactin to update metadata account
  const transaction = new Transaction().add(
    createUpdateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        updateAuthority: user.publicKey,
      },
      {
        updateMetadataAccountArgsV2: {
          data: tokenMetadata,
          updateAuthority: user.publicKey,
          primarySaleHappened: true,
          isMutable: true,
        },
      }
    )
  )

  // send transaction
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [user]
  )

  console.log(
    `Update Metadata Account: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

async function mintTokenHelper(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  authority: Keypair,
  amount: number
) {
  // get or create assoicated token account
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  )

  // get mint info (to adjust for decimals when minting)
  const mintInfo = await getMint(connection, mint)

  // mint tokens
  const transactionSignature = await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    authority,
    amount * 10 ** mintInfo.decimals
  )

  console.log(
    `Mint Token Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
  )
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
