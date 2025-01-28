'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
    Card,
    CardBody,
    CardHeader,
} from "@heroui/card";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";
import { IconWallet, IconCreditCard, IconNft } from "@/app/components/icons";
import { IAgentProfile } from '@/app/utils/interface';
import { useFetch } from '@/app/utils/lib';
import { toast } from 'react-hot-toast';
import { Skeleton } from "@heroui/skeleton";
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    useDisclosure
} from "@heroui/modal";
import { CircularProgress } from "@heroui/progress";
import { buyTransaction } from '@/app/utils/buyTransaction';
import { loadStripe } from '@stripe/stripe-js';
import { mintNft } from '@/app/utils/mintNft';
import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import {
    publicKey
} from '@metaplex-foundation/umi'
import { Image, Tooltip } from "@heroui/react";

interface INftMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    metadata?: {
        uri: string;
    };
}

const PaymentPage = () => {
    const wallet = useWallet();
    const { connection } = useConnection();
    const [amount, setAmount] = useState('');
    const [agent, setAgent] = useState<IAgentProfile | null>(null);
    const [agentBalance, setAgentBalance] = useState(0);
    const [solPrice, setSolPrice] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState('sol');
    const [withdrawMethod, setWithdrawMethod] = useState('sol');
    const [availableBalance,] = useState(0);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [creditAmount, setCreditAmount] = useState(0);
    const [paymentAmount, setPaymentAmount] = useState('');
    const fetchData = useFetch();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [nftMetadata, setNftMetadata] = useState<INftMetadata | null>(null);
    const [agentSuccessRate, setAgentSuccessRate] = useState(0);

    const isWithdrawDisabled = () => {
        return true;
    };

    const handleBuyCredits = async () => {
        if (!amount || !paymentAmount || !paymentMethod) {
            toast.error("Please fill all fields");
            return;
        }
        onOpen();
    };

    const confirmPurchase = async () => {
        setIsProcessing(true);
        if (!amount || !paymentAmount || !paymentMethod) {
            toast.error("Please fill all fields");
            return;
        }
        if (paymentMethod === 'stripe') {
            const stripe = await loadStripe(
                process.env.STRIPE_PUBLIC_KEY!
            );
            if (!stripe) {
                console.log("stripe is not defined");
                toast.error("stripe is not defined");
                setIsProcessing(false);
                return;
            }
            try {
                const response = await fetchData.post('/api/stripeCheckout', {
                    amount: Number(paymentAmount)
                });
                if (!response.status) {
                    toast.error(response.message);
                    setIsProcessing(false);
                    return;
                }
                await stripe.redirectToCheckout({
                    sessionId: response.result.id
                });
            } catch (error: unknown) {
                console.log(error);
                toast.error(error instanceof Error ? error.message : 'Unknown error occurred');
            }
        } else {
            try {
                const intentResponse = await fetchData.post('/api/createPaymentIntent', {
                    amount: Number(paymentAmount),
                    creditAmount: Number(creditAmount),
                    paymentMethod,
                    walletAddress: wallet.publicKey?.toString()
                });

                if (!intentResponse.status) {
                    throw new Error('Failed to create payment intent');
                }

                const paymentId = intentResponse.paymentId;

                const signature = await buyTransaction(
                    wallet,
                    connection,
                    Number(paymentAmount),
                    paymentMethod,
                    paymentId
                );

                const verifyResponse = await fetchData.post('/api/verifyAndCredit', {
                    paymentId,
                    signature
                });

                if (verifyResponse.status) {
                    setAgentBalance(agentBalance + Number(amount));
                    toast.success("Credits purchased successfully");
                } else {
                    throw new Error(verifyResponse.message || 'Failed to process credit purchase');
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                toast.error(`Failed to purchase credits: ${errorMessage}`);
            }
        }
        setIsProcessing(false);
        onClose();
    }

    const handleWithdraw = async () => {
    };

    const handleMintNFT = async () => {
        if (!agent) {
            toast.error("Please update your agent profile first");
            return;
        }
        setIsMinting(true);
        try {
            const { nftAddress, ipfsHash } = await mintNft(wallet, agent, agentSuccessRate);
            const result = await fetchData.post('/api/saveNftAddress', {
                id: agent.id,
                nft_address: nftAddress,
                ipfs_hash: ipfsHash
            });
            if (result.status) {
                toast.success("NFT minted successfully");
                console.log(nftAddress);
                setAgent({ ...agent, nft_address: nftAddress });
            } else {
                toast.error("Failed to mint NFT: " + result.message);
            }
        } catch (error) {
            console.log(error);
            toast.error("Failed to mint NFT: " + error);
        }
        setIsMinting(false);
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmount(value);
        setCreditAmount(Number(value) * Number(process.env.CREDIT_BALANCE));
        updatePaymentAmount(value, paymentMethod);
    };

    const handlePaymentMethodChange = (value: string) => {
        setPaymentMethod(value);
        updatePaymentAmount(amount, value);
    };

    const updatePaymentAmount = (value: string, method: string) => {
        if (!value) {
            setPaymentAmount('');
            return;
        }

        const usdAmount = Number(value);
        switch (method) {
            case 'sol':
                setPaymentAmount((usdAmount / Number(solPrice)).toFixed(4));
                break;
            case 'usdt':
                setPaymentAmount(usdAmount.toFixed(2));
                break;
            case 'stripe':
                setPaymentAmount(usdAmount.toFixed(2));
                break;
            default:
                setPaymentAmount('');
        }
    };

    const fetchNftMetadata = async (nftAddress: string, ipfsHash: string) => {
        try {
            const umi = createUmi('https://api.devnet.solana.com')
                .use(mplCore())
                .use(walletAdapterIdentity(wallet));
            
            const nftPublicKey = publicKey(nftAddress);
            
            try {
                const metadata = await fetchDigitalAsset(umi, nftPublicKey);
                console.log("metadata", metadata);
                
                // Fetch additional metadata from URI if needed
                if (metadata.metadata.uri) {
                    const response = await fetch(metadata.metadata.uri);
                    const jsonMetadata = await response.json();
                    setNftMetadata({
                        ...metadata,
                        ...jsonMetadata
                    });
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AccountNotFoundError') {
                    console.log('NFT metadata not found - this may be normal for newly minted NFTs');
                    const response = await fetch(`https://${process.env.PINATA_GATEWAY}/ipfs/${ipfsHash}`);
                    const jsonMetadata = await response.json();
                    setNftMetadata(jsonMetadata);
                } else {
                    throw error; // Re-throw other errors
                }
            }
        } catch (error) {
            console.error('Error fetching NFT metadata:', error);
            toast.error('Failed to load NFT details. This may be normal for newly minted NFTs.');
            setNftMetadata(null);
        }
    };

    useEffect(() => {
        const fetchAgentProfile = async () => {
            try {
                const response = await fetchData.get('/api/getAgentProfile');
                if (response.status) {
                    setAgent(response.agent);
                    setAgentBalance(response.agent.wallet_balance);
                    setAgentSuccessRate(response.successRate);
                } else {
                    toast.error(response.message);
                }
            } catch (error) {
                console.log(error);
                toast.error('Failed to fetch agent profile');
            }
            await getSolPrice();
            setIsLoading(false);
        };
        const getSolPrice = async () => {
            const response = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT');
            const data = await response.json();
            setSolPrice(data.price);
        }

        fetchAgentProfile();
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
            toast.success('Order placed! You will receive an email confirmation.');
        }

        if (query.get('canceled')) {
            toast.error('Order canceled -- continue to buy credits when you are ready.');
        }
    }, []);

    useEffect(() => {
        if (agent?.nft_address && agent?.ipfs_hash) {
            fetchNftMetadata(agent.nft_address, agent.ipfs_hash);
        }
    }, [agent?.nft_address, agent?.ipfs_hash]);

    return (
        <>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-lg font-bold">Payment & Credits</h1>
                <WalletMultiButton />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Buy Credits Card */}
                <Card className="p-4 bg-content0">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconCreditCard />
                            <h2 className="text-lg font-bold">Buy Credits</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-content0 p-4 rounded-lg">
                            <p className="text-lg mb-2">Current Balance</p>
                            {
                                isLoading ?
                                    <Skeleton className="w-full h-10" /> :
                                    <p className="text-xl font-bold text-primary">{agentBalance?.toLocaleString() || 0} Credits</p>
                            }
                        </div>
                        <Input
                            type="number"
                            label="Amount"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={handleAmountChange}
                            isDisabled={isLoading}

                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-gray-500 text-small">$</span>
                                </div>
                            }
                            description={amount ? `You will receive ${creditAmount.toLocaleString()} Credits` : ""}

                        />
                        <Select
                            label="Payment Method"
                            placeholder="Select payment method"
                            value={paymentMethod}
                            onChange={(e) => handlePaymentMethodChange(e.target.value)}
                            isDisabled={isLoading}
                            description={amount && paymentAmount ?
                                `You will pay ${paymentAmount} ${paymentMethod.toUpperCase()}` :
                                ""}
                            defaultSelectedKeys={['sol']}
                            classNames={{
                                trigger: "bg-content0"
                            }}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Pay with SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Pay with USDT
                            </SelectItem>
                            <SelectItem key="stripe" value="stripe" startContent={<IconCreditCard />}>
                                Credit Card
                            </SelectItem>
                        </Select>
                        <Button
                            color="primary"
                            size="lg"
                            className="w-full"
                            onPress={handleBuyCredits}
                            isDisabled={isLoading}
                        >
                            Buy Credits
                        </Button>
                    </CardBody>
                </Card>

                {/* Withdraw Card */}
                <Card className="p-4 bg-content0">
                    <CardHeader className="pb-2">
                        <div className="flex items-center space-x-2">
                            <IconWallet />
                            <h2 className="text-lg font-bold">Withdraw Funds</h2>
                        </div>
                    </CardHeader>
                    <CardBody className="space-y-6">
                        <div className="text-center bg-content0 p-4 rounded-lg">
                            <p className="text-lg mb-2">Available to Withdraw</p>
                            <p className="text-xl font-bold text-success">{availableBalance} Credits</p>
                        </div>
                        <Input
                            type="number"
                            label="Withdrawal Amount"
                            placeholder="Enter amount to withdraw"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            isDisabled={!wallet.publicKey || availableBalance <= 0}
                            startContent={
                                <div className="pointer-events-none flex items-center">
                                    <span className="text-gray-500 text-small">$</span>
                                </div>
                            }
                            errorMessage={
                                withdrawAmount && Number(withdrawAmount) > availableBalance
                                    ? "Amount exceeds available balance"
                                    : ""
                            }
                        />
                        <Select
                            label="Withdrawal Method"
                            placeholder="Select withdrawal method"
                            value={withdrawMethod}
                            onChange={(e) => setWithdrawMethod(e.target.value)}
                            isDisabled={!wallet.publicKey || availableBalance <= 0}
                        >
                            <SelectItem key="sol" value="sol" startContent={<IconWallet />}>
                                Withdraw as SOL
                            </SelectItem>
                            <SelectItem key="usdt" value="usdt" startContent={<IconWallet />}>
                                Withdraw as USDT
                            </SelectItem>
                            <SelectItem key="bank" value="bank" startContent={<IconCreditCard />}>
                                Bank Transfer
                            </SelectItem>
                        </Select>
                        <Button
                            color="success"
                            size="lg"
                            className="w-full"
                            onPress={handleWithdraw}
                            isDisabled={isWithdrawDisabled()}
                        >
                            {!wallet.publicKey
                                ? "Connect Wallet to Withdraw"
                                : availableBalance <= 0
                                    ? "No Funds Available"
                                    : "Withdraw Funds"
                            }
                        </Button>
                        {isWithdrawDisabled() && (
                            <p className="text-warning text-sm text-center">
                                No Available Withdrawals
                            </p>
                        )}
                    </CardBody>
                </Card>
            </div>

            {/* NFT Card */}
            <Card className="p-4 mt-6 bg-content0">
                <CardHeader className="pb-2">
                    <div className="flex items-center space-x-2">
                        <IconNft />
                        <h2 className="text-2xl font-bold">NFT Marketplace</h2>
                    </div>
                </CardHeader>
                <CardBody>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Column - Mint Controls */}
                        <div className="space-y-6">
                            <div className="bg-content1 rounded-xl p-6">
                                <h3 className="text-xl font-semibold mb-3">Mint NFT with your agent</h3>
                                <p className="text-default-500 mb-6">
                                    Create your unique NFT on the Solana blockchain. Each NFT represents exclusive benefits in our platform.
                                </p>
                                <Button
                                    color="primary"
                                    size="lg"
                                    className="w-full"
                                    onPress={handleMintNFT}
                                    isDisabled={isMinting}
                                >
                                    {isMinting ? (
                                        <div className="flex items-center gap-2">
                                            <CircularProgress size="sm" color="primary" />
                                            <span>Minting...</span>
                                        </div>
                                    ) : agent?.nft_address ? "Update NFT" : "Mint NFT"}
                                </Button>
                            </div>
                        </div>

                        {/* Right Column - NFT Display */}
                        <div className="bg-content1 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold">Your NFT</h3>
                                {agent?.nft_address && (
                                    <Button
                                        as="a"
                                        href={`https://explorer.solana.com/address/${agent.nft_address}?cluster=devnet`}
                                        target="_blank"
                                        variant="flat"
                                        color="primary"
                                        size="sm"
                                    >
                                        View on Explorer
                                    </Button>
                                )}
                            </div>
                            
                            {agent?.nft_address ? (
                                nftMetadata ? (
                                    <div className="space-y-6">
                                        {nftMetadata.image && (
                                            <div className="relative aspect-square w-full max-w-[200px] mx-auto overflow-hidden rounded-xl">
                                                <Tooltip content={`${nftMetadata.name} on Metaplex Explorer`}>
                                                    <Image
                                                        src={nftMetadata.image}
                                                        alt={nftMetadata.name}
                                                        className="w-[200px] h-[200px] object-cover hover:scale-105 transition-transform duration-300"
                                                        isBlurred
                                                    />
                                                </Tooltip>
                                            </div>
                                        )}
                                        <div className="space-y-3 bg-content2 rounded-lg p-4">
                                            <div className="grid grid-cols-[100px_1fr] gap-2">                                                
                                                <span className="text-default-500">Symbol:</span>
                                                <span className="font-medium">{nftMetadata.symbol}</span>
                                                <span className="text-default-500">Description:</span>
                                                <span className="font-medium">{nftMetadata.description}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[300px] gap-4">
                                        <CircularProgress size="lg" />
                                        <p className="text-default-500">Loading NFT details...</p>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center h-[300px] bg-content2 rounded-xl">
                                    <IconNft />
                                    <p className="text-default-500 text-center">
                                        You haven&apos;t minted an NFT yet.<br />
                                        Mint one to get started!
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardBody>
            </Card>

            <Modal
                isOpen={isOpen}
                onClose={onClose}
                isDismissable={false}
                isKeyboardDismissDisabled={true}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Confirm Purchase</ModalHeader>
                            <ModalBody>
                                <p>You are about to purchase:</p>
                                <p className="font-bold">{creditAmount.toLocaleString()} Credits</p>
                                <p>Payment details:</p>
                                <p className="font-bold">{paymentAmount} {paymentMethod.toUpperCase()}</p>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="light" onPress={onClose} isDisabled={isProcessing}>
                                    Cancel
                                </Button>
                                <Button color="primary" onPress={confirmPurchase} isDisabled={isProcessing}>
                                    {isProcessing ? <CircularProgress size="sm" color="primary" /> : "Confirm Purchase"}
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};

export default PaymentPage;