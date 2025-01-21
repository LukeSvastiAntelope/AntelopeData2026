import { create, update, mplCore,  } from '@metaplex-foundation/mpl-core'
import {
    generateSigner,
    publicKey
} from '@metaplex-foundation/umi'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys'
import { base58 } from '@metaplex-foundation/umi/serializers'
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { WalletContextState } from "@solana/wallet-adapter-react";
import { encrypt } from './lib';
import { IAgentProfile } from './interface'

export const mintNft = async (
    wallet: WalletContextState,
    agent: IAgentProfile,
    agentSuccessRate: number
) => {
    if (!wallet.publicKey) {
        throw new Error("Pls connect wallet");
    }

    if (!agent.name || !agent.description || !agent.image) {
        throw new Error("Pls update your agent profile first");
    }

    if (!agent.interests || !agent.principles || !agent.category) {
        throw new Error("Pls update your agent profile first");
    }

    const umi = createUmi('https://api.devnet.solana.com')
        .use(mplCore())
        .use(
            irysUploader({
                // mainnet address: "https://node1.irys.xyz"
                // devnet address: "https://devnet.irys.xyz"
                address: 'https://devnet.irys.xyz',
            })
        )
        .use(walletAdapterIdentity(wallet))

    const imgRes = await fetch(agent.image);
    if (!imgRes.ok) {
        throw new Error('Failed to fetch image from URL');
    }

    const imageBlob = await imgRes.blob();
    const contentType = imgRes.headers.get('Content-Type') ?? ""; // Get the content type
    const fileExtension = contentType?.split('/')[1]; // Extract file extension
    const imageName = `image_${Date.now()}.${fileExtension}`; // Generate a default filename

    const formData = new FormData();
    formData.append("file", imageBlob, imageName);

    const request = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
        body: formData,
    });
    const response = await request.json();
    const fileUrl = response.IpfsHash;

    const metadata = {
        name: agent.name,
        description: `${agent.description} success rate: ${Number(agentSuccessRate.toFixed(2))}%`,
        image: `https://${process.env.PINATA_GATEWAY}/ipfs/${fileUrl}`,
        symbol: "Agent",
        external_url: 'https://getantelope.com',
        attributes: [
            {
                trait_type: 'interests',
                value: encrypt(agent.interests.join(', ')),
            },
            {
                trait_type: 'principles',
                value: encrypt(agent.principles.join(', ')),
            },
            {
                trait_type: 'category',
                value: encrypt(agent.category),
            }
        ],
        properties: {
            files: [
                {
                    uri: `https://${process.env.PINATA_GATEWAY}/ipfs/${fileUrl}`
                },
            ],
            category: 'image',
        },
    }

    console.log('Uploading Metadata...')

    const jsonString = JSON.stringify(metadata, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const file = new File([blob], `meta_${Date.now()}.json`);
    const newFormData = new FormData();
    newFormData.append("file", file);

    const metaRequest = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
        body: newFormData,
    });
    const metaResponse = await metaRequest.json();

    console.log('Creating NFT...')

    let nftPublicKey;
    if (agent.nft_address) {
        console.log('Updating existing NFT...');
        const existingNftPublicKey = publicKey(agent.nft_address);
        const tx = await update(umi, {
            asset: {
                publicKey: existingNftPublicKey,
                owner: umi.identity.publicKey,
                oracles: [],
                lifecycleHooks: []
            },
            name: agent.name,
            uri: `https://${process.env.PINATA_GATEWAY}/ipfs/${metaResponse.IpfsHash}`,
        }).sendAndConfirm(umi);
        
        nftPublicKey = existingNftPublicKey;
        const signature = base58.deserialize(tx.signature)[0]
        console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`)
    } else {
        console.log('Creating new NFT...');
        const asset = generateSigner(umi);
        const owner = umi.identity.publicKey;

        const tx = await create(umi, {
            asset,
            name: agent.name,
            uri: `https://${process.env.PINATA_GATEWAY}/ipfs/${metaResponse.IpfsHash}`,
            owner: owner,
        }).sendAndConfirm(umi);

        nftPublicKey = asset.publicKey;
        const signature = base58.deserialize(tx.signature)[0]
        console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`)
    }

    // Log out the signature and the links to the transaction and the NFT.
    console.log('\nNFT Operation Completed')
    console.log('View Transaction on Solana Explorer')
    console.log('\n')
    console.log('View NFT on Metaplex Explorer')
    console.log(`https://core.metaplex.com/explorer/${nftPublicKey}?env=devnet`)
    return { nftAddress: nftPublicKey.toString(), ipfsHash: metaResponse.IpfsHash };
}

